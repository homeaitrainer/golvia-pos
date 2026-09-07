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
        static::deleting(fn () => throw new LogicException('Membership tiers are retained and deactivated, not deleted.'));
    }
}
