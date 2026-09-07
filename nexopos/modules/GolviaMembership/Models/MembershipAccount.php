<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class MembershipAccount extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_LOCKED = 'locked';

    public const STATUS_DEACTIVATED = 'deactivated';

    protected $table = 'golvia_membership_accounts';

    protected $guarded = ['id'];

    protected $casts = [
        'available_coin_balance' => 'integer',
        'lifetime_earned_coins' => 'integer',
        'joined_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::saving(function (self $account): void {
            if (! in_array($account->status, [
                self::STATUS_ACTIVE,
                self::STATUS_LOCKED,
                self::STATUS_DEACTIVATED,
            ], true)) {
                throw new LogicException('Unsupported membership account status.');
            }
        });
    }
}
