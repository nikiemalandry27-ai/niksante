package com.niksante.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

class AlarmSchedulerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val PREFS_NAME = "NikSanteAlarms"
        const val KEY_ALARMS = "alarms"

        fun scheduleExact(
            context: Context,
            am: AlarmManager,
            id: Int,
            hour: Int,
            minute: Int,
            title: String,
            body: String
        ) {
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                putExtra(AlarmReceiver.EXTRA_ID,     id)
                putExtra(AlarmReceiver.EXTRA_TITLE,  title)
                putExtra(AlarmReceiver.EXTRA_BODY,   body)
                putExtra(AlarmReceiver.EXTRA_HOUR,   hour)
                putExtra(AlarmReceiver.EXTRA_MINUTE, minute)
            }
            val pi = PendingIntent.getBroadcast(
                context, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE,      minute)
                set(Calendar.SECOND,      0)
                set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) {
                    add(Calendar.DAY_OF_YEAR, 1)
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
                }
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
            }
        }

        fun saveAlarm(context: Context, id: Int, hour: Int, minute: Int, title: String, body: String) {
            val prefs    = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val existing = JSONArray(prefs.getString(KEY_ALARMS, "[]") ?: "[]")
            val filtered = JSONArray()
            for (i in 0 until existing.length()) {
                if (existing.getJSONObject(i).getInt("id") != id) filtered.put(existing.getJSONObject(i))
            }
            filtered.put(JSONObject().apply {
                put("id", id); put("hour", hour); put("minute", minute)
                put("title", title); put("body", body)
            })
            prefs.edit().putString(KEY_ALARMS, filtered.toString()).apply()
        }

        fun removeAlarm(context: Context, id: Int) {
            val prefs    = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val existing = JSONArray(prefs.getString(KEY_ALARMS, "[]") ?: "[]")
            val filtered = JSONArray()
            for (i in 0 until existing.length()) {
                if (existing.getJSONObject(i).getInt("id") != id) filtered.put(existing.getJSONObject(i))
            }
            prefs.edit().putString(KEY_ALARMS, filtered.toString()).apply()
        }
    }

    override fun getName() = "AlarmScheduler"

    @ReactMethod
    fun scheduleDaily(id: Int, hour: Int, minute: Int, title: String, body: String, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val am  = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            scheduleExact(ctx, am, id, hour, minute, title, body)
            saveAlarm(ctx, id, hour, minute, title, body)
            promise.resolve(id)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAlarm(id: Int, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val pi  = PendingIntent.getBroadcast(
                ctx, id, Intent(ctx, AlarmReceiver::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            if (pi != null) {
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                am.cancel(pi)
                pi.cancel()
            }
            removeAlarm(ctx, id)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            promise.resolve(am.canScheduleExactAlarms())
        } else {
            promise.resolve(true)
        }
    }
}
