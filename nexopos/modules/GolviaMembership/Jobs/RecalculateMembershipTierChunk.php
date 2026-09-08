<?php

namespace Modules\GolviaMembership\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Services\TierManagementService;
use Throwable;

class RecalculateMembershipTierChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public readonly int $ruleVersionId,
        public readonly int $chunkSize = 100,
    ) {
    }

    public function handle(TierManagementService $tiers): void
    {
        $version = MembershipRuleVersion::query()->findOrFail($this->ruleVersionId);
        $result = $tiers->recalculateChunk($version, $this->chunkSize);

        if ($result->recalculation_state === MembershipRuleVersion::RECALCULATION_RUNNING
            && config('queue.default') !== 'sync') {
            self::dispatch($this->ruleVersionId, $this->chunkSize)->delay(now()->addSecond());
        }
    }

    public function failed(Throwable $exception): void
    {
        app(TierManagementService::class)->markRecalculationFailed($this->ruleVersionId);
    }
}
