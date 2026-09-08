<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_last_account_id')) {
            Schema::table('golvia_membership_rule_versions', function (Blueprint $table): void {
                $table->unsignedBigInteger('recalculation_last_account_id')->default(0);
            });
        }
        if (! Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_processed_accounts')) {
            Schema::table('golvia_membership_rule_versions', function (Blueprint $table): void {
                $table->unsignedBigInteger('recalculation_processed_accounts')->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_last_account_id')) {
            Schema::table('golvia_membership_rule_versions', function (Blueprint $table): void {
                $table->dropColumn('recalculation_last_account_id');
            });
        }
        if (Schema::hasColumn('golvia_membership_rule_versions', 'recalculation_processed_accounts')) {
            Schema::table('golvia_membership_rule_versions', function (Blueprint $table): void {
                $table->dropColumn('recalculation_processed_accounts');
            });
        }
    }
};
