<?php

namespace Modules\GolviaMembership\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\GolviaMembership\Services\MembershipSettingsService;
use Modules\GolviaMembership\Services\TierManagementService;
use Modules\GolviaMembership\Services\TierResolver;

class GolviaMembershipServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(MembershipSettingsService::class);
        $this->app->singleton(TierResolver::class);
        $this->app->singleton(TierManagementService::class);
    }

    public function boot(): void
    {
        // Core integration hooks are registered by later feature slices.
    }
}
