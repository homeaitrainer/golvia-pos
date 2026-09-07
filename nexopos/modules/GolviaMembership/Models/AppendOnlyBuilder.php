<?php

namespace Modules\GolviaMembership\Models;

use LogicException;

class AppendOnlyBuilder extends RetainedRecordBuilder
{
    public function update(array $values)
    {
        throw new LogicException('Append-only GOLVIA records cannot be bulk updated.');
    }
}
