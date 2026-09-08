<?php

namespace Modules\GolviaMembership\Models;

use LogicException;

class AppendOnlyBuilder extends RetainedRecordBuilder
{
    public function update(array $values)
    {
        throw new LogicException('Append-only GOLVIA records cannot be bulk updated.');
    }

    public function updateOrCreate(array $attributes, array $values = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot be updated or created through a hybrid operation.');
    }

    public function incrementOrCreate(array $attributes, string $column = 'count', $default = 1, $step = 1, array $extra = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot use increment-or-create operations.');
    }

    public function upsert(array $values, $uniqueBy, $update = null)
    {
        throw new LogicException('Append-only GOLVIA records cannot be upserted.');
    }

    public function updateOrInsert(array $attributes, array|callable $values = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot use update-or-insert operations.');
    }

    public function updateFrom(array $values)
    {
        throw new LogicException('Append-only GOLVIA records cannot be bulk updated.');
    }

    public function touch($column = null)
    {
        throw new LogicException('Append-only GOLVIA records cannot be touched.');
    }

    public function increment($column, $amount = 1, array $extra = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot be incremented.');
    }

    public function incrementEach(array $columns, array $extra = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot be incremented.');
    }

    public function decrement($column, $amount = 1, array $extra = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot be decremented.');
    }

    public function decrementEach(array $columns, array $extra = [])
    {
        throw new LogicException('Append-only GOLVIA records cannot be decremented.');
    }

    public function forceDelete()
    {
        throw new LogicException('Append-only GOLVIA records cannot be force deleted.');
    }

    public function truncate()
    {
        throw new LogicException('Append-only GOLVIA records cannot be truncated.');
    }
}
