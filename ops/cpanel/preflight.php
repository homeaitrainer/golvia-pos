<?php

declare(strict_types=1);

require __DIR__.'/../../nexopos/vendor/autoload.php';
require_once __DIR__.'/src/PreflightEvaluator.php';

use Golvia\Cpanel\PreflightEvaluator;

$requiredEnvironment = [
    'GOLVIA_PREFLIGHT_DB_HOST',
    'GOLVIA_PREFLIGHT_DB_PORT',
    'GOLVIA_PREFLIGHT_DB_NAME',
    'GOLVIA_PREFLIGHT_DB_USER',
    'GOLVIA_PREFLIGHT_DOCUMENT_ROOT',
];

foreach ($requiredEnvironment as $name) {
    if (getenv($name) === false || getenv($name) === '') {
        fwrite(STDERR, "Missing environment variable: {$name}\n");
        exit(2);
    }
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

try {
    $sttyState = $runTerminalCommand('stty -g 2>/dev/null');
    if ($sttyState === '') {
        fwrite(STDERR, "Unable to securely read the database password.\n");
        exit(3);
    }

    $runTerminalCommand('stty -echo 2>/dev/null');
    $maskedSttyState = $runTerminalCommand('stty -g 2>/dev/null');
    if ($maskedSttyState === '' || $maskedSttyState === $sttyState) {
        $runTerminalCommand('stty '.escapeshellarg($sttyState).' 2>/dev/null');
        fwrite(STDERR, "Unable to securely read the database password.\n");
        exit(3);
    }
} catch (Throwable) {
    fwrite(STDERR, "Unable to securely read the database password.\n");
    exit(3);
}

$output = null;
$exitCode = 3;

try {
    fwrite(STDERR, 'Database password: ');
    $passwordInput = fgets(STDIN);
    fwrite(STDERR, PHP_EOL);
    if ($passwordInput === false) {
        throw new RuntimeException('No database password was provided.');
    }

    // Preserve password whitespace; remove only the newline entered at the prompt.
    $password = rtrim($passwordInput, "\r\n");
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        getenv('GOLVIA_PREFLIGHT_DB_HOST'),
        getenv('GOLVIA_PREFLIGHT_DB_PORT'),
        getenv('GOLVIA_PREFLIGHT_DB_NAME')
    );

    $pdo = new PDO($dsn, (string) getenv('GOLVIA_PREFLIGHT_DB_USER'), $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $serverVersion = (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    $driver = stripos($serverVersion, 'mariadb') !== false ? 'mariadb' : 'mysql';
    preg_match('/\d+\.\d+\.\d+/', $serverVersion, $matches);

    $projectRoot = realpath(__DIR__.'/../../nexopos');
    $publicRoot = $projectRoot === false ? false : realpath($projectRoot.'/public');
    $documentRoot = realpath((string) getenv('GOLVIA_PREFLIGHT_DOCUMENT_ROOT'));
    $composerVersion = '';

    try {
        if (function_exists('shell_exec')) {
            $composerVersion = trim((string) @shell_exec('composer --version 2>&1'));
        }
    } catch (Throwable) {
        // A restricted host cannot run Composer; report that compatibility check as failed.
    }

    $inventory = [
        'php_version' => PHP_VERSION,
        'extensions' => get_loaded_extensions(),
        'database_driver' => $driver,
        'database_version' => $matches[0] ?? '0.0.0',
        'commands' => ['composer' => str_starts_with($composerVersion, 'Composer version 2.'), 'php' => true],
        'paths' => [
            'storage_writable' => $projectRoot !== false && is_writable($projectRoot.'/storage'),
            'cache_writable' => $projectRoot !== false && is_writable($projectRoot.'/bootstrap/cache'),
            'public_root_isolated' => $publicRoot !== false && $documentRoot === $publicRoot,
        ],
        'cron_available' => getenv('GOLVIA_PREFLIGHT_CRON_AVAILABLE') === '1',
        'ssl_available' => getenv('GOLVIA_PREFLIGHT_SSL_AVAILABLE') === '1',
        'url_rewrite_available' => getenv('GOLVIA_PREFLIGHT_REWRITE_AVAILABLE') === '1',
    ];

    $result = PreflightEvaluator::evaluate($inventory);
    $result['inventory'] = [
        'php_version' => $inventory['php_version'],
        'extensions' => $inventory['extensions'],
        'database_driver' => $inventory['database_driver'],
        'database_version' => $inventory['database_version'],
    ];

    $output = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL;
    $exitCode = $result['compatible'] ? 0 : 1;
} catch (Throwable) {
    fwrite(STDERR, "Preflight failed without disclosing database credentials.\n");
} finally {
    $runTerminalCommand('stty '.escapeshellarg($sttyState).' 2>/dev/null');
}

if ($output !== null) {
    echo $output;
}

exit($exitCode);
