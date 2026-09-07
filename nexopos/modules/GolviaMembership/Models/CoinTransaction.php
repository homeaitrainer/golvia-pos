<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use LogicException;

class CoinTransaction extends Model
{
    public const ACTION_EARN = 'earn';

    public const ACTION_REDEEM = 'redeem';

    public const ACTION_RESTORE = 'restore';

    public const ACTION_REVERSE_EARN = 'reverse_earn';

    public const ACTION_ADJUST = 'adjust';

    protected $table = 'golvia_coin_transactions';

    protected $guarded = ['id'];

    protected $casts = [
        'balance_delta' => 'integer',
        'lifetime_delta' => 'integer',
        'balance_after' => 'integer',
        'lifetime_after' => 'integer',
        'rule_version_snapshot' => 'array',
        'metadata' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $transaction): void {
            if (! in_array($transaction->action, [
                self::ACTION_EARN,
                self::ACTION_REDEEM,
                self::ACTION_RESTORE,
                self::ACTION_REVERSE_EARN,
                self::ACTION_ADJUST,
            ], true)) {
                throw new LogicException('Unsupported coin transaction action.');
            }

            if (trim((string) $transaction->payload_fingerprint) === '') {
                throw new LogicException('A payload fingerprint is required.');
            }
        });

        static::updating(fn () => throw new LogicException('Coin transactions are append-only.'));
        static::deleting(fn () => throw new LogicException('Coin transactions are append-only.'));
    }

    public function newEloquentBuilder($query): AppendOnlyBuilder
    {
        /** @var QueryBuilder $query */
        return new AppendOnlyBuilder($query);
    }
}
