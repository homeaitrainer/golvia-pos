<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class MembershipRuleVersion extends Model
{
    public const STATE_DRAFT = 'draft';

    public const STATE_ACTIVE = 'active';

    public const STATE_RETIRED = 'retired';

    public const RECALCULATION_PENDING = 'pending';

    public const RECALCULATION_RUNNING = 'running';

    public const RECALCULATION_COMPLETED = 'completed';

    public const RECALCULATION_FAILED = 'failed';

    protected $table = 'golvia_membership_rule_versions';

    protected $guarded = ['id'];

    protected $casts = [
        'enabled' => 'boolean',
        'earning_spend_amount' => 'decimal:2',
        'coins_earned' => 'integer',
        'redemption_coins' => 'integer',
        'redemption_value' => 'decimal:2',
        'effective_at' => 'datetime',
        'recalculation_last_account_id' => 'integer',
        'recalculation_processed_accounts' => 'integer',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $version): void {
            if ($version->isDirty([
                'version_key',
                'enabled',
                'earning_spend_amount',
                'coins_earned',
                'redemption_coins',
                'redemption_value',
                'effective_at',
                'actor_id',
            ])) {
                throw new LogicException('Published membership rule values are immutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Membership rule versions are retained, not deleted.'));
    }

    public function newEloquentBuilder($query): RuleVersionBuilder
    {
        return new RuleVersionBuilder($query);
    }
}
