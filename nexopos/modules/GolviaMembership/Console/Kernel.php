<?php

namespace Modules\GolviaMembership\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    public function schedule(Schedule $schedule): void
    {
        $schedule->command('golvia:membership-recalculate-tiers --chunk=100')
            ->everyMinute()
            ->withoutOverlapping();
    }
}
