<?php

namespace Modules\GolviaMembership\Models;

use LogicException;

class TierVersionBuilder extends RetainedRecordBuilder
{
    private const IMMUTABLE_FIELDS = [
        'rule_version_id',
        'key',
        'name',
        'minimum_lifetime_coins',
        'maximum_lifetime_coins',
        'discount_percent',
        'display_order',
    ];

    public function update(array $values)
    {
        if (array_intersect(array_keys($values), self::IMMUTABLE_FIELDS) !== []) {
            throw new LogicException('Versioned membership tier values cannot be bulk updated.');
        }

        return parent::update($values);
    }
}
