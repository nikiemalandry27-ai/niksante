package com.niksante.app

import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Bundle

// Activité sans UI, lancée par setAlarmClock() à la place d'un BroadcastReceiver.
// Les Activity ne sont PAS bloquées par le gel de processus OEM (TECNO, Infinix, etc.)
// contrairement aux broadcasts. Elle montre la notification et se ferme immédiatement.
class AlarmActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        processAlarm(intent)
        finish()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        processAlarm(intent)
        finish()
    }

    private fun processAlarm(intent: Intent) {
        val id     = intent.getIntExtra(AlarmReceiver.EXTRA_ID, -1)
        val title  = intent.getStringExtra(AlarmReceiver.EXTRA_TITLE) ?: return
        val body   = intent.getStringExtra(AlarmReceiver.EXTRA_BODY) ?: return
        val hour   = intent.getIntExtra(AlarmReceiver.EXTRA_HOUR, -1)
        val minute = intent.getIntExtra(AlarmReceiver.EXTRA_MINUTE, -1)

        AlarmReceiver.showNotification(this, id, title, body)

        if (id >= 0 && hour >= 0 && minute >= 0) {
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            AlarmSchedulerModule.scheduleExact(this, am, id, hour, minute, title, body)
        }
    }
}
