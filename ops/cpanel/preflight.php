<?php

declare(strict_types=1);

require __DIR__.'/../../nexopos/vendor/autoload.php';
require_once __DIR__.'/src/PreflightEvaluator.php';
require_once __DIR__.'/src/PreflightCommand.php';

use Golvia\Cpanel\PreflightCommand;

$environment = [];
foreach ([
    'GOLVIA_PREFLIGHT_DB_HOST',
    'GOLVIA_PREFLIGHT_DB_PORT',
    'GOLVIA_PREFLIGHT_DB_NAME',
    'GOLVIA_PREFLIGHT_DB_USER',
    'GOLVIA_PREFLIGHT_DOCUMENT_ROOT',
    'GOLVIA_PREFLIGHT_CRON_AVAILABLE',
    'GOLVIA_PREFLIGHT_SSL_AVAILABLE',
    'GOLVIA_PREFLIGHT_REWRITE_AVAILABLE',
] as $name) {
    $environment[$name] = (string) getenv($name);
}

$runTerminalCommand = static function (string $command): string {
    try {
        if (function_exists('exec')) {
            $lines = [];
            $exitCode = 1;
            @exec($command, $lines, $exitCode);

            return $exitCode === 0 ? trim(implode(PHP_EOL, $lines)) : '';
        }

        if (function_exists('shell_exec')) {
            return trim((string) @shell_exec($command));
        }
    } catch (Throwable) {
        // A restricted host may disable command execution.
    }

    return '';
};

$result = PreflightCommand::run(
    $environment,
    static function (): string {
        fwrite(STDERR, 'Database password: ');
        $passwordInput = fgets(STDIN);
        fwrite(STDERR, PHP_EOL);
        if ($passwordInput === false) {
            throw new RuntimeException('No database password was provided.');
        }

        // Preserve password whitespace; remove only the newline entered at the prompt.
        return rtrim($passwordInput, "\r\n");
    },
    static fn (string $dsn, string $user, string $password): PDO => new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]),
    $runTerminalCommand,
    static function (): string {
        if (! function_exists('shell_exec')) {
            return '';
        }

        return (string) @shell_exec('composer --version 2>&1');
    },
    static fn (string $path): bool => PreflightCommand::isWritableDirectory($path),
    [
        'php_version' => PHP_VERSION,
        'extensions' => get_loaded_extensions(),
        'project_root' => realpath(__DIR__.'/../../nexopos'),
        'public_root' => realpath(__DIR__.'/../../nexopos/public'),
        'document_root' => realpath($environment['GOLVIA_PREFLIGHT_DOCUMENT_ROOT']),
    ]
);

fwrite(STDERR, $result['stderr']);
echo $result['stdout'];
exit($result['exit_code']);
