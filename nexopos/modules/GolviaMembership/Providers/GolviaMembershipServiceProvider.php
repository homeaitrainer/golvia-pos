<?php

namespace Modules\GolviaMembership\Providers;

use Illuminate\Support\ServiceProvider;

class GolviaMembershipServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Module services are registered by later feature slices.
    }

    public function boot(): void
    {
        // Core integration hooks are registered by later feature slices.
    }
}
