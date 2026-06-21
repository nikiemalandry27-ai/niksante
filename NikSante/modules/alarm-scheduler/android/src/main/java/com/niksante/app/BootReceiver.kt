package com.niksante.app

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON") return

        val prefs = context.getSharedPreferences(AlarmSchedulerModule.PREFS_NAME, Context.MODE_PRIVATE)
        val raw   = prefs.getString(AlarmSchedulerModule.KEY_ALARMS, "[]") ?: "[]"

        try {
            val alarms = JSONArray(raw)
            val am     = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            for (i in 0 until alarms.length()) {
                val a = alarms.getJSONObject(i)
                AlarmSchedulerModule.scheduleExact(
                    context, am,
                    a.getInt("id"),
                    a.getInt("hour"),
                    a.getInt("minute"),
                    a.getString("title"),
                    a.getString("body")
                )
            }
            if (alarms.length() > 0) {
                AlarmForegroundService.start(context)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
