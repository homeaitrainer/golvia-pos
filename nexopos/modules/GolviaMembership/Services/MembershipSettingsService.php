<?php

namespace Modules\GolviaMembership\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\MembershipTier;
use Modules\GolviaMembership\Models\SettingsAudit;
use RuntimeException;

class MembershipSettingsService
{
    public function current(): array
    {
        return $this->serialize($this->activeVersion());
    }

    public function activeVersion(): MembershipRuleVersion
    {
        $version = MembershipRuleVersion::query()
            ->where('activation_state', MembershipRuleVersion::STATE_ACTIVE)
            ->where('effective_at', '<=', now())
            ->orderByDesc('effective_at')
            ->orderByDesc('id')
            ->first();

        if (! $version instanceof MembershipRuleVersion) {
            throw new RuntimeException('No active GOLVIA membership rule version exists.');
        }

        return $version;
    }

    public function update(array $input, int $actorId): array
    {
        return DB::transaction(function () use ($input, $actorId): array {
            $current = MembershipRuleVersion::query()
                ->where('activation_state', MembershipRuleVersion::STATE_ACTIVE)
                ->lockForUpdate()
                ->sole();
            $oldValues = $this->financialValues($current);
            $newValues = [
                'enabled' => (bool) $input['enabled'],
                'earning_spend_amount' => $this->normalizePositiveMoney($input['earning_spend_amount']),
                'coins_earned' => (int) $input['coins_earned'],
                'redemption_coins' => (int) $input['redemption_coins'],
                'redemption_value' => $this->normalizePositiveMoney($input['redemption_value']),
            ];
            if ($newValues['coins_earned'] < 1 || $newValues['redemption_coins'] < 1) {
                throw new \InvalidArgumentException('Coin ratios must be positive integers.');
            }

            $version = MembershipRuleVersion::query()->create([
                ...$newValues,
                'version_key' => 'settings-' . Str::uuid(),
                'activation_state' => MembershipRuleVersion::STATE_ACTIVE,
                'recalculation_state' => MembershipRuleVersion::RECALCULATION_COMPLETED,
                'recalculation_last_account_id' => 0,
                'recalculation_processed_accounts' => 0,
                'actor_id' => $actorId,
                'effective_at' => now(),
            ]);

            $this->copyTiers($current, $version);
            $current->retireByDomain();
            SettingsAudit::query()->create([
                'rule_version_id' => $version->id,
                'old_values' => $oldValues,
                'new_values' => $newValues,
                'actor_id' => $actorId,
                'effective_at' => $version->effective_at,
            ]);

            return $this->serialize($version->fresh());
        });
    }

    public function serialize(MembershipRuleVersion $version): array
    {
        return [
            'id' => $version->id,
            'version_key' => $version->version_key,
            ...$this->financialValues($version),
            'earning_spend_sen' => $this->moneyToSen($version->earning_spend_amount),
            'redemption_value_sen' => $this->moneyToSen($version->redemption_value),
            'activation_state' => $version->activation_state,
            'recalculation_state' => $version->recalculation_state,
            'recalculation_last_account_id' => (int) ($version->recalculation_last_account_id ?? 0),
            'recalculation_processed_accounts' => (int) ($version->recalculation_processed_accounts ?? 0),
            'effective_at' => $version->effective_at?->toISOString(),
        ];
    }

    public function moneyToSen(string|int $amount): int
    {
        $normalized = $this->normalizeMoney($amount);
        [$ringgit, $sen] = explode('.', $normalized);

        return ((int) $ringgit * 100) + (int) $sen;
    }

    private function normalizeMoney(string|int $amount): string
    {
        $value = (string) $amount;
        if (! preg_match('/^\d+(?:\.\d{1,2})?$/', $value)) {
            throw new \InvalidArgumentException('Money must be a positive decimal with at most two decimal places.');
        }
        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');

        return ltrim($whole, '0') === ''
            ? '0.' . str_pad($fraction, 2, '0')
            : ltrim($whole, '0') . '.' . str_pad($fraction, 2, '0');
    }

    private function normalizePositiveMoney(string|int $amount): string
    {
        $normalized = $this->normalizeMoney($amount);
        if ($this->moneyToSen($normalized) < 1) {
            throw new \InvalidArgumentException('Money must be greater than zero.');
        }

        return $normalized;
    }

    private function financialValues(MembershipRuleVersion $version): array
    {
        return [
            'enabled' => (bool) $version->enabled,
            'earning_spend_amount' => (string) $version->earning_spend_amount,
            'coins_earned' => (int) $version->coins_earned,
            'redemption_coins' => (int) $version->redemption_coins,
            'redemption_value' => (string) $version->redemption_value,
        ];
    }

    private function copyTiers(MembershipRuleVersion $from, MembershipRuleVersion $to): void
    {
        MembershipTier::query()
            ->where('rule_version_id', $from->id)
            ->orderBy('display_order')
            ->get()
            ->each(fn (MembershipTier $tier) => MembershipTier::query()->create([
                'rule_version_id' => $to->id,
                'key' => $tier->key,
                'name' => $tier->name,
                'minimum_lifetime_coins' => $tier->minimum_lifetime_coins,
                'maximum_lifetime_coins' => $tier->maximum_lifetime_coins,
                'discount_percent' => $tier->discount_percent,
                'display_order' => $tier->display_order,
                'is_active' => $tier->is_active,
            ]));
    }
}
