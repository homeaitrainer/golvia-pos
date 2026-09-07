<?php

namespace Golvia\Cpanel;

final class PreflightEvaluator
{
    private const REQUIRED_EXTENSIONS = [
        'curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip',
    ];

    public static function evaluate(array $inventory): array
    {
        $extensions = array_map('strtolower', $inventory['extensions']);
        $missing = array_values(array_diff(self::REQUIRED_EXTENSIONS, $extensions));
        $databaseSupported = match (strtolower($inventory['database_driver'])) {
            'mysql' => version_compare($inventory['database_version'], '8.4.0', '>='),
            'mariadb' => version_compare($inventory['database_version'], '10.11.0', '>='),
            default => false,
        };

        $checks = [
            self::check('PHP 8.2 or newer', version_compare($inventory['php_version'], '8.2.0', '>='), $inventory['php_version']),
            self::check('Required PHP extensions', $missing === [], $missing === [] ? 'all loaded' : 'missing: '.implode(', ', $missing)),
            self::check('Supported database', $databaseSupported, $inventory['database_driver'].' '.$inventory['database_version']),
            self::check('Composer 2', (bool) ($inventory['commands']['composer'] ?? false), 'required for locked dependency installation'),
            self::check('Writable Laravel storage', (bool) ($inventory['paths']['storage_writable'] ?? false), 'storage must be writable'),
            self::check('Writable Laravel cache', (bool) ($inventory['paths']['cache_writable'] ?? false), 'bootstrap/cache must be writable'),
            self::check('Isolated public document root', (bool) ($inventory['paths']['public_root_isolated'] ?? false), 'only nexopos/public may be web-accessible'),
            self::check('Cron Jobs', (bool) $inventory['cron_available'], 'Laravel scheduler must run'),
            self::check('HTTPS', (bool) $inventory['ssl_available'], 'production and staging require HTTPS'),
            self::check('Apache URL rewriting', (bool) $inventory['url_rewrite_available'], 'Laravel front controller requires rewriting'),
        ];

        return [
            'compatible' => ! in_array(false, array_column($checks, 'passed'), true),
            'checks' => $checks,
        ];
    }

    private static function check(string $name, bool $passed, string $detail): array
    {
        return compact('name', 'passed', 'detail');
    }
}
