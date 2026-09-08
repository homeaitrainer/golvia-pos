<?php

use App\Http\Middleware\NsRestrictMiddleware;
use Illuminate\Support\Facades\Route;
use Modules\GolviaMembership\Http\Controllers\MembershipSettingsController;
use Modules\GolviaMembership\Http\Controllers\TierController;

Route::prefix('golvia-membership')->middleware('auth:sanctum')->group(function (): void {
    Route::middleware(NsRestrictMiddleware::arguments('golvia.membership.manage-settings'))->group(function (): void {
        Route::get('settings', [MembershipSettingsController::class, 'show']);
        Route::patch('settings', [MembershipSettingsController::class, 'update']);
    });

    Route::middleware(NsRestrictMiddleware::arguments('golvia.membership.manage-tiers'))->group(function (): void {
        Route::patch('tiers', [TierController::class, 'update']);
        Route::post('tier-versions/{version}/activate', [TierController::class, 'activate']);
        Route::post('tier-versions/{version}/recalculate', [TierController::class, 'recalculate']);
    });
});
