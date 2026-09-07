<?php

namespace Modules\GolviaMembership\Models;

use Illuminate\Database\Eloquent\Builder;
use LogicException;

/**
 * Prevents bulk Eloquent deletion for records retained by the membership audit model.
 *
 * This is the strongest portable application-level boundary shared by SQLite and
 * MySQL/MariaDB. Raw DB statements intentionally sit outside Eloquent and must be
 * restricted to migrations and the module's reviewed services; database triggers
 * are not used because their DDL and lifecycle are not portable across those engines.
 */
class RetainedRecordBuilder extends Builder
{
    public function delete()
    {
        throw new LogicException('Retained GOLVIA records cannot be bulk deleted.');
    }
}
