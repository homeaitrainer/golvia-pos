<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class MembershipTier extends Model
{
    protected $table = 'golvia_membership_tiers';

    protected $guarded = ['id'];

    protected $casts = [
        'minimum_lifetime_coins' => 'integer',
        'maximum_lifetime_coins' => 'integer',
        'discount_percent' => 'decimal:2',
        'display_order' => 'integer',
        'is_active' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $tier): void {
            if ($tier->isDirty([
                'rule_version_id',
                'key',
                'name',
                'minimum_lifetime_coins',
                'maximum_lifetime_coins',
                'discount_percent',
                'display_order',
            ])) {
                throw new LogicException('Versioned membership tier values are immutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Membership tiers are retained and deactivated, not deleted.'));
    }

    public function newEloquentBuilder($query): TierVersionBuilder
    {
        return new TierVersionBuilder($query);
    }
}
