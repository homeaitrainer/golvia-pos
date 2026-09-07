<?php

namespace Tests\Feature\Golvia;

use Tests\TestCase;

class PlatformContractTest extends TestCase
{
    public function test_pinned_nexopos_runtime_and_module_contract(): void
    {
        $composer = json_decode(
            file_get_contents(base_path('composer.json')),
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $package = json_decode(
            file_get_contents(base_path('package.json')),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        $this->assertSame('^8.2.0', $composer['require']['php']);
        $this->assertSame('^12.0', $composer['require']['laravel/framework']);
        $this->assertSame('modules/', $composer['autoload']['psr-4']['Modules\\']);
        $this->assertSame('24.x', $package['engines']['node']);
        $this->assertFileExists(base_path('LICENSE'));
        $this->assertFileExists(base_path('UPSTREAM.md'));
    }
}
