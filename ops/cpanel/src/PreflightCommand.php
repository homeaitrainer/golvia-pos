<?php

namespace Golvia\Cpanel;

use RuntimeException;
use Throwable;

final class PreflightCommand
{
    private const REQUIRED_ENVIRONMENT = [
        'GOLVIA_PREFLIGHT_DB_HOST',
        'GOLVIA_PREFLIGHT_DB_PORT',
        'GOLVIA_PREFLIGHT_DB_NAME',
        'GOLVIA_PREFLIGHT_DB_USER',
        'GOLVIA_PREFLIGHT_DOCUMENT_ROOT',
    ];

    public static function run(
        array $environment,
        callable $readPassword,
        callable $connect,
        callable $runTerminalCommand,
        callable $composerVersion,
        callable $pathProbe,
        array $runtime
    ): array {
        foreach (self::REQUIRED_ENVIRONMENT as $name) {
            if (! isset($environment[$name]) || $environment[$name] === '') {
                return self::result(2, '', "Missing environment variable: {$name}\n");
            }
        }

        try {
            $sttyState = $runTerminalCommand('stty -g 2>/dev/null');
            if ($sttyState === '') {
                return self::result(3, '', "Unable to securely read the database password.\n");
            }

            $runTerminalCommand('stty -echo 2>/dev/null');
            $maskedSttyState = $runTerminalCommand('stty -g 2>/dev/null');
            if ($maskedSttyState === '' || $maskedSttyState === $sttyState) {
                $runTerminalCommand('stty '.escapeshellarg($sttyState).' 2>/dev/null');

                return self::result(3, '', "Unable to securely read the database password.\n");
            }
        } catch (Throwable) {
            return self::result(3, '', "Unable to securely read the database password.\n");
        }

        $stderr = '';

        try {
            $password = $readPassword();
            if (! is_string($password)) {
                throw new RuntimeException('No database password was provided.');
            }

            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                $environment['GOLVIA_PREFLIGHT_DB_HOST'],
                $environment['GOLVIA_PREFLIGHT_DB_PORT'],
                $environment['GOLVIA_PREFLIGHT_DB_NAME']
            );
            $pdo = $connect($dsn, $environment['GOLVIA_PREFLIGHT_DB_USER'], $password);
            $serverVersion = (string) $pdo->getAttribute(\PDO::ATTR_SERVER_VERSION);
            $driver = stripos($serverVersion, 'mariadb') !== false ? 'mariadb' : 'mysql';
            preg_match('/\d+\.\d+\.\d+/', $serverVersion, $matches);

            try {
                $installedComposerVersion = (string) $composerVersion();
            } catch (Throwable) {
                $installedComposerVersion = '';
            }

            $projectRoot = $runtime['project_root'] ?? false;
            $publicRoot = $runtime['public_root'] ?? false;
            $documentRoot = $runtime['document_root'] ?? false;
            $inventory = [
                'php_version' => $runtime['php_version'],
                'extensions' => $runtime['extensions'],
                'database_driver' => $driver,
                'database_version' => $matches[0] ?? '0.0.0',
                'commands' => ['composer' => str_starts_with($installedComposerVersion, 'Composer version 2.'), 'php' => true],
                'paths' => [
                    'storage_writable' => $projectRoot !== false && $pathProbe($projectRoot.'/storage'),
                    'cache_writable' => $projectRoot !== false && $pathProbe($projectRoot.'/bootstrap/cache'),
                    'public_root_isolated' => $publicRoot !== false && $documentRoot === $publicRoot,
                ],
                'cron_available' => ($environment['GOLVIA_PREFLIGHT_CRON_AVAILABLE'] ?? '') === '1',
                'ssl_available' => ($environment['GOLVIA_PREFLIGHT_SSL_AVAILABLE'] ?? '') === '1',
                'url_rewrite_available' => ($environment['GOLVIA_PREFLIGHT_REWRITE_AVAILABLE'] ?? '') === '1',
            ];
            $result = PreflightEvaluator::evaluate($inventory);
            $result['inventory'] = [
                'php_version' => $inventory['php_version'],
                'extensions' => $inventory['extensions'],
                'database_driver' => $inventory['database_driver'],
                'database_version' => $inventory['database_version'],
            ];

            return self::result(
                $result['compatible'] ? 0 : 1,
                json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL,
                $stderr
            );
        } catch (Throwable) {
            return self::result(3, '', $stderr."Preflight failed without disclosing database credentials.\n");
        } finally {
            $runTerminalCommand('stty '.escapeshellarg($sttyState).' 2>/dev/null');
        }
    }

    public static function isWritableDirectory(string $path): bool
    {
        return is_dir($path) && is_writable($path);
    }

    private static function result(int $exitCode, string $stdout, string $stderr): array
    {
        return compact('exitCode', 'stdout', 'stderr') + ['exit_code' => $exitCode];
    }
}
