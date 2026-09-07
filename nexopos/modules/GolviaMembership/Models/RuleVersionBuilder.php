<?php

namespace Modules\GolviaMembership\Models;

use LogicException;

class RuleVersionBuilder extends RetainedRecordBuilder
{
    private const IMMUTABLE_FIELDS = [
        'enabled',
        'earning_spend_amount',
        'coins_earned',
        'redemption_coins',
        'redemption_value',
        'effective_at',
        'actor_id',
    ];

    public function update(array $values)
    {
        if (array_intersect(array_keys($values), self::IMMUTABLE_FIELDS) !== []) {
            throw new LogicException('Published membership rule values cannot be bulk updated.');
        }

        return parent::update($values);
    }
}
