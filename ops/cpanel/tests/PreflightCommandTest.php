<?php

namespace Golvia\Cpanel\Tests;

require_once __DIR__.'/../src/PreflightEvaluator.php';
require_once __DIR__.'/../src/PreflightCommand.php';

use Golvia\Cpanel\PreflightCommand;
use PHPUnit\Framework\TestCase;

class PreflightCommandTest extends TestCase
{
    // Catches a failure handler mutation that writes a caught database exception containing the supplied credential.
    public function test_connection_failure_output_never_contains_the_supplied_credential(): void
    {
        $credential = 'synthetic-credential-sentinel';

        $result = PreflightCommand::run(
            $this->environment(),
            static fn (): string => $credential,
            static function (string $dsn, string $user, string $password): never {
                throw new \RuntimeException('Connection rejected for '.$password);
            },
            $this->workingTerminal(),
            static fn (string $command): string => 'Composer version 2.8.0',
            static fn (string $path): bool => true,
            ['php_version' => '8.3.15', 'extensions' => ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip']]
        );

        $this->assertSame(3, $result['exit_code']);
        $this->assertSame('', $result['stdout']);
        $this->assertStringNotContainsString($credential, $result['stdout']);
        $this->assertStringNotContainsString($credential, $result['stderr']);
        $this->assertSame("Preflight failed without disclosing database credentials.\n", str_replace("\r\n", "\n", $result['stderr']));
    }

    // Catches a terminal-control regression that prompts for a credential after echo suppression failed.
    public function test_terminal_control_failure_does_not_read_a_credential(): void
    {
        $credentialRead = false;

        $result = PreflightCommand::run(
            $this->environment(),
            static function () use (&$credentialRead): string {
                $credentialRead = true;

                return 'synthetic-credential-sentinel';
            },
            static fn (): never => throw new \LogicException('Connection must not be attempted.'),
            static fn (string $command): string => '',
            static fn (string $command): string => 'Composer version 2.8.0',
            static fn (string $path): bool => true,
            ['php_version' => '8.3.15', 'extensions' => []]
        );

        $this->assertFalse($credentialRead);
        $this->assertSame(3, $result['exit_code']);
        $this->assertSame('', $result['stdout']);
        $this->assertSame("Unable to securely read the database password.\n", $result['stderr']);
    }

    // Catches a path-probe mutation that treats any writable filesystem entry as a Laravel directory.
    public function test_writable_directory_probe_rejects_a_file_and_accepts_a_directory(): void
    {
        $directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'golvia-preflight-'.bin2hex(random_bytes(8));
        mkdir($directory);
        $file = $directory.DIRECTORY_SEPARATOR.'writable-file';
        file_put_contents($file, 'fixture');

        try {
            $this->assertFalse(PreflightCommand::isWritableDirectory($file));
            $this->assertTrue(PreflightCommand::isWritableDirectory($directory));
        } finally {
            unlink($file);
            rmdir($directory);
        }
    }

    private function environment(): array
    {
        return [
            'GOLVIA_PREFLIGHT_DB_HOST' => 'database.example.test',
            'GOLVIA_PREFLIGHT_DB_PORT' => '3306',
            'GOLVIA_PREFLIGHT_DB_NAME' => 'golvia',
            'GOLVIA_PREFLIGHT_DB_USER' => 'golvia-user',
            'GOLVIA_PREFLIGHT_DOCUMENT_ROOT' => __DIR__,
        ];
    }

    private function workingTerminal(): callable
    {
        $states = ['before-echo', '', 'after-echo', ''];

        return static function (string $command) use (&$states): string {
            return array_shift($states) ?? '';
        };
    }
}
