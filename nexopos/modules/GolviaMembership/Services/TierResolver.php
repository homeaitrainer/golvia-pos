<?php

namespace Modules\GolviaMembership\Services;

use InvalidArgumentException;
use Modules\GolviaMembership\Models\MembershipRuleVersion;
use Modules\GolviaMembership\Models\MembershipTier;
use RuntimeException;

class TierResolver
{
    public function __construct(private readonly MembershipSettingsService $settings)
    {
    }

    public function resolve(int $lifetimeEarnedCoins, ?MembershipRuleVersion $version = null): MembershipTier
    {
        if ($lifetimeEarnedCoins < 0) {
            throw new InvalidArgumentException('Lifetime-earned coins cannot be negative.');
        }

        $version ??= $this->settings->activeVersion();
        $tier = MembershipTier::query()
            ->where('rule_version_id', $version->id)
            ->where('is_active', true)
            ->where('minimum_lifetime_coins', '<=', $lifetimeEarnedCoins)
            ->where(fn ($query) => $query
                ->whereNull('maximum_lifetime_coins')
                ->orWhere('maximum_lifetime_coins', '>=', $lifetimeEarnedCoins))
            ->orderByDesc('minimum_lifetime_coins')
            ->first();

        if (! $tier instanceof MembershipTier) {
            throw new RuntimeException('No membership tier covers the supplied lifetime coin total.');
        }

        return $tier;
    }
}
