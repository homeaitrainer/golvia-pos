<?php

namespace Modules\GolviaMembership\Console\Commands;

use Illuminate\Console\Command;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Services\TierManagementService;
use Throwable;

class RecalculateMembershipTiers extends Command
{
    protected $signature = 'golvia:membership-recalculate-tiers {--chunk=100}';

    protected $description = 'Resume one bounded tier-recalculation chunk for each pending membership version.';

    public function __construct(private readonly TierManagementService $tiers)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $chunkSize = filter_var($this->option('chunk'), FILTER_VALIDATE_INT);
        if ($chunkSize === false || $chunkSize < 1 || $chunkSize > 500) {
            $this->error('Chunk size must be between 1 and 500.');

            return self::INVALID;
        }

        $failed = false;
        MembershipRuleVersion::query()
            ->where('activation_state', MembershipRuleVersion::STATE_ACTIVE)
            ->whereIn('recalculation_state', [
                MembershipRuleVersion::RECALCULATION_PENDING,
                MembershipRuleVersion::RECALCULATION_RUNNING,
            ])
            ->orderBy('id')
            ->get()
            ->each(function (MembershipRuleVersion $version) use ($chunkSize, &$failed): void {
                try {
                    $this->tiers->recalculateChunk($version, $chunkSize);
                } catch (Throwable $exception) {
                    $failed = true;
                    $this->tiers->markRecalculationFailed($version->id);
                    $this->error("Rule version {$version->id}: {$exception->getMessage()}");
                }
            });

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
