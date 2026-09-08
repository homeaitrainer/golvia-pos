<?php

namespace Modules\GolviaMembership\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\GolviaMembership\Models\MembershipAccount;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\MembershipTier;
use Modules\GolviaMembership\Models\SettingsAudit;
use Modules\GolviaMembership\Jobs\RecalculateMembershipTierChunk;
use RuntimeException;

class TierManagementService
{
    public function __construct(
        private readonly MembershipSettingsService $settings,
        private readonly TierResolver $resolver,
    ) {
    }

    public function createDraft(array $tiers, int $actorId): MembershipRuleVersion
    {
        $tiers = $this->validateAndNormalizeTiers($tiers);

        return DB::transaction(function () use ($tiers, $actorId): MembershipRuleVersion {
            $current = $this->settings->activeVersion();
            $draft = MembershipRuleVersion::query()->create([
                'version_key' => 'tiers-' . Str::uuid(),
                'enabled' => $current->enabled,
                'earning_spend_amount' => $current->earning_spend_amount,
                'coins_earned' => $current->coins_earned,
                'redemption_coins' => $current->redemption_coins,
                'redemption_value' => $current->redemption_value,
                'activation_state' => MembershipRuleVersion::STATE_DRAFT,
                'recalculation_state' => MembershipRuleVersion::RECALCULATION_PENDING,
                'recalculation_last_account_id' => 0,
                'recalculation_processed_accounts' => 0,
                'actor_id' => $actorId,
                'effective_at' => now(),
            ]);

            foreach (array_values($tiers) as $index => $tier) {
                MembershipTier::query()->create([
                    ...$tier,
                    'rule_version_id' => $draft->id,
                    'display_order' => $index + 1,
                    'is_active' => true,
                    'discount_percent' => $this->normalizePercent($tier['discount_percent']),
                ]);
            }

            SettingsAudit::query()->create([
                'rule_version_id' => $draft->id,
                'old_values' => ['tiers' => $this->tierSnapshot($current)],
                'new_values' => ['tiers' => $this->tierSnapshot($draft)],
                'actor_id' => $actorId,
                'effective_at' => $draft->effective_at,
            ]);

            return $draft->fresh();
        });
    }

    public function activate(MembershipRuleVersion $version, int $actorId): MembershipRuleVersion
    {
        return DB::transaction(function () use ($version, $actorId): MembershipRuleVersion {
            $locked = MembershipRuleVersion::query()->lockForUpdate()->findOrFail($version->id);
            if ($locked->activation_state === MembershipRuleVersion::STATE_ACTIVE) {
                return $locked;
            }
            if ($locked->activation_state !== MembershipRuleVersion::STATE_DRAFT) {
                throw new RuntimeException('Only a draft tier version can be activated.');
            }

            $previousActive = MembershipRuleVersion::query()
                ->where('activation_state', MembershipRuleVersion::STATE_ACTIVE)
                ->lockForUpdate()
                ->first();
            if ($previousActive instanceof MembershipRuleVersion) {
                $previousActive->retireByDomain();
            }

            $activationTime = now();
            $oldState = [
                'activation_state' => $locked->activation_state,
                'actor_id' => $locked->actor_id,
                'effective_at' => $locked->effective_at?->toISOString(),
            ];
            $locked->activateBy($actorId, $activationTime);
            SettingsAudit::query()->create([
                'rule_version_id' => $locked->id,
                'old_values' => $oldState,
                'new_values' => [
                    'activation_state' => MembershipRuleVersion::STATE_ACTIVE,
                    'actor_id' => $actorId,
                    'effective_at' => $activationTime->toISOString(),
                    'previous_active_rule_version_id' => $previousActive?->id,
                ],
                'actor_id' => $actorId,
                'effective_at' => $activationTime,
            ]);

            DB::afterCommit(fn () => RecalculateMembershipTierChunk::dispatch($locked->id, 100));

            return $locked->fresh();
        });
    }

    public function recalculateChunk(MembershipRuleVersion $version, int $chunkSize): MembershipRuleVersion
    {
        if ($chunkSize < 1 || $chunkSize > 500) {
            throw new \InvalidArgumentException('Tier recalculation chunk size must be between 1 and 500.');
        }

        return DB::transaction(function () use ($version, $chunkSize): MembershipRuleVersion {
            $locked = MembershipRuleVersion::query()->lockForUpdate()->findOrFail($version->id);
            if ($locked->activation_state !== MembershipRuleVersion::STATE_ACTIVE) {
                throw new RuntimeException('Only the active tier version can recalculate accounts.');
            }
            if ($locked->recalculation_state === MembershipRuleVersion::RECALCULATION_COMPLETED) {
                return $locked;
            }

            $accounts = MembershipAccount::query()
                ->where('id', '>', (int) $locked->recalculation_last_account_id)
                ->orderBy('id')
                ->limit($chunkSize)
                ->lockForUpdate()
                ->get();

            foreach ($accounts as $account) {
                $account->forceFill([
                    'current_tier_id' => $this->resolver->resolve($account->lifetime_earned_coins, $locked)->id,
                    'tier_evaluated_at' => now(),
                ])->save();
            }

            $lastId = $accounts->isEmpty()
                ? (int) $locked->recalculation_last_account_id
                : (int) $accounts->last()->id;
            $hasMore = MembershipAccount::query()->where('id', '>', $lastId)->exists();
            $locked->update([
                'recalculation_state' => $hasMore
                    ? MembershipRuleVersion::RECALCULATION_RUNNING
                    : MembershipRuleVersion::RECALCULATION_COMPLETED,
                'recalculation_last_account_id' => $lastId,
                'recalculation_processed_accounts' => (int) $locked->recalculation_processed_accounts + $accounts->count(),
            ]);

            return $locked->fresh();
        });
    }

    public function markRecalculationFailed(int $ruleVersionId): MembershipRuleVersion
    {
        return DB::transaction(function () use ($ruleVersionId): MembershipRuleVersion {
            $version = MembershipRuleVersion::query()->lockForUpdate()->findOrFail($ruleVersionId);
            if ($version->recalculation_state !== MembershipRuleVersion::RECALCULATION_COMPLETED) {
                $version->update(['recalculation_state' => MembershipRuleVersion::RECALCULATION_FAILED]);
            }

            return $version->fresh();
        });
    }

    private function normalizePercent(string|int $percent): string
    {
        $value = (string) $percent;
        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');

        return ltrim($whole, '0') === ''
            ? '0.' . str_pad($fraction, 2, '0')
            : ltrim($whole, '0') . '.' . str_pad($fraction, 2, '0');
    }

    private function validateAndNormalizeTiers(array $tiers): array
    {
        if ($tiers === []) {
            throw new \InvalidArgumentException('At least one membership tier is required.');
        }

        $normalized = [];
        $keys = [];
        foreach ($tiers as $tier) {
            if (! is_array($tier)) {
                throw new \InvalidArgumentException('Each membership tier must be an object.');
            }
            foreach (['key', 'name', 'minimum_lifetime_coins', 'maximum_lifetime_coins', 'discount_percent'] as $field) {
                if (! array_key_exists($field, $tier)) {
                    throw new \InvalidArgumentException("Membership tier field {$field} is required.");
                }
            }

            $key = (string) $tier['key'];
            $name = (string) $tier['name'];
            if (! preg_match('/^[a-z0-9][a-z0-9_-]*$/', $key) || strlen($key) > 40 || isset($keys[$key])) {
                throw new \InvalidArgumentException('Membership tier keys must be unique lowercase identifiers.');
            }
            if ($name === '' || mb_strlen($name) > 80) {
                throw new \InvalidArgumentException('Membership tier names must contain 1 to 80 characters.');
            }
            $keys[$key] = true;
            $minimum = $this->validatedCoinBound($tier['minimum_lifetime_coins'], false);
            $maximum = $tier['maximum_lifetime_coins'] === null
                ? null
                : $this->validatedCoinBound($tier['maximum_lifetime_coins'], true);
            $percent = (string) $tier['discount_percent'];
            if (! preg_match('/^\d{1,3}(?:\.\d{1,2})?$/', $percent) || $this->percentBasisPoints($percent) > 10000) {
                throw new \InvalidArgumentException('Membership discounts must be decimal percentages between 0 and 100.');
            }

            $normalized[] = [
                'key' => $key,
                'name' => $name,
                'minimum_lifetime_coins' => $minimum,
                'maximum_lifetime_coins' => $maximum,
                'discount_percent' => $this->normalizePercent($percent),
            ];
        }

        usort($normalized, fn (array $left, array $right): int => $left['minimum_lifetime_coins'] <=> $right['minimum_lifetime_coins']);
        if ($normalized[0]['minimum_lifetime_coins'] !== 0) {
            throw new \InvalidArgumentException('Membership tier coverage must begin at zero.');
        }

        $openEnded = 0;
        foreach ($normalized as $index => $tier) {
            if ($tier['maximum_lifetime_coins'] === null) {
                $openEnded++;
                if ($index !== array_key_last($normalized)) {
                    throw new \InvalidArgumentException('Only the final membership tier may be open-ended.');
                }
            } elseif ($tier['maximum_lifetime_coins'] < $tier['minimum_lifetime_coins']) {
                throw new \InvalidArgumentException('A membership tier maximum cannot be below its minimum.');
            }

            if ($index > 0) {
                $previousMaximum = $normalized[$index - 1]['maximum_lifetime_coins'];
                if ($previousMaximum === null || $tier['minimum_lifetime_coins'] !== $previousMaximum + 1) {
                    throw new \InvalidArgumentException('Membership tiers must be contiguous and non-overlapping.');
                }
            }
        }
        if ($openEnded !== 1) {
            throw new \InvalidArgumentException('Exactly one membership tier must be open-ended.');
        }

        return $normalized;
    }

    private function validatedCoinBound(mixed $value, bool $boundedMaximum): int
    {
        $validated = filter_var($value, FILTER_VALIDATE_INT, [
            'options' => [
                'min_range' => 0,
                'max_range' => $boundedMaximum ? PHP_INT_MAX - 1 : PHP_INT_MAX,
            ],
        ]);
        if ($validated === false) {
            throw new \InvalidArgumentException('Membership tier coin bounds must be non-negative integers.');
        }

        return $validated;
    }

    private function percentBasisPoints(string $percent): int
    {
        [$whole, $fraction] = array_pad(explode('.', $percent, 2), 2, '');

        return ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
    }

    private function tierSnapshot(MembershipRuleVersion $version): array
    {
        return MembershipTier::query()
            ->where('rule_version_id', $version->id)
            ->orderBy('display_order')
            ->get()
            ->map(fn (MembershipTier $tier): array => [
                'key' => $tier->key,
                'name' => $tier->name,
                'minimum_lifetime_coins' => $tier->minimum_lifetime_coins,
                'maximum_lifetime_coins' => $tier->maximum_lifetime_coins,
                'discount_percent' => $tier->discount_percent,
            ])
            ->all();
    }
}
