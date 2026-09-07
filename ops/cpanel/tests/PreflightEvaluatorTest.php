<?php

namespace Golvia\Cpanel\Tests;

require_once __DIR__.'/../src/PreflightEvaluator.php';

use Golvia\Cpanel\PreflightEvaluator;
use PHPUnit\Framework\TestCase;

class PreflightEvaluatorTest extends TestCase
{
    // Catches a production mutation that treats a complete, supported inventory as incompatible.
    public function test_accepts_a_compatible_cpanel_inventory(): void
    {
        $result = PreflightEvaluator::evaluate([
            'php_version' => '8.3.15',
            'extensions' => ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip'],
            'database_driver' => 'mariadb',
            'database_version' => '10.11.8',
            'commands' => ['composer' => true, 'php' => true],
            'paths' => ['storage_writable' => true, 'cache_writable' => true, 'public_root_isolated' => true],
            'cron_available' => true,
            'ssl_available' => true,
            'url_rewrite_available' => true,
        ]);

        $this->assertTrue($result['compatible']);
        $this->assertNotEmpty($result['checks']);
    }

    // Catches a production mutation that overlooks one or more blocking shared-host incompatibilities.
    public function test_rejects_a_typical_incompatible_shared_host(): void
    {
        $result = PreflightEvaluator::evaluate([
            'php_version' => '8.1.29',
            'extensions' => ['curl', 'mbstring'],
            'database_driver' => 'mysql',
            'database_version' => '5.7.44',
            'commands' => ['composer' => false, 'php' => true],
            'paths' => ['storage_writable' => false, 'cache_writable' => false, 'public_root_isolated' => false],
            'cron_available' => false,
            'ssl_available' => true,
            'url_rewrite_available' => false,
        ]);

        $this->assertFalse($result['compatible']);
        $failedNames = array_column(
            array_filter($result['checks'], fn (array $check) => ! $check['passed']),
            'name'
        );
        $this->assertContains('PHP 8.2 or newer', $failedNames);
        $this->assertContains('Required PHP extensions', $failedNames);
        $this->assertContains('Composer 2', $failedNames);
        $this->assertContains('Isolated public document root', $failedNames);
        $this->assertContains('Cron Jobs', $failedNames);
    }

    // Catches a credential-leak mutation that includes a database password in the evaluator result.
    public function test_result_is_safe_json_without_credentials(): void
    {
        $result = PreflightEvaluator::evaluate([
            'php_version' => '8.3.15',
            'extensions' => ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_mysql', 'zip'],
            'database_driver' => 'mysql',
            'database_version' => '8.4.3',
            'commands' => ['composer' => true, 'php' => true],
            'paths' => ['storage_writable' => true, 'cache_writable' => true, 'public_root_isolated' => true],
            'cron_available' => true,
            'ssl_available' => true,
            'url_rewrite_available' => true,
        ]);

        $json = json_encode($result, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('password', strtolower($json));
        $this->assertStringNotContainsString('proper15_golviauser', $json);
    }
}
