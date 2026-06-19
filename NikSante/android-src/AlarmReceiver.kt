package com.niksante.app

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.util.Calendar

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID   = "niksante-rappels"
        const val EXTRA_ID     = "notif_id"
        const val EXTRA_TITLE  = "title"
        const val EXTRA_BODY   = "body"
        const val EXTRA_HOUR   = "hour"
        const val EXTRA_MINUTE = "minute"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val notifId = intent.getIntExtra(EXTRA_ID, 0)
        val title   = intent.getStringExtra(EXTRA_TITLE)  ?: "Rappel NikSanté"
        val body    = intent.getStringExtra(EXTRA_BODY)   ?: "Pensez à mesurer votre glycémie !"
        val hour    = intent.getIntExtra(EXTRA_HOUR, 8)
        val minute  = intent.getIntExtra(EXTRA_MINUTE, 0)

        showNotification(context, notifId, title, body)
        // Replanifie le jour suivant (AlarmManager est one-shot)
        rescheduleNextDay(context, notifId, hour, minute, title, body)
    }

    private fun showNotification(context: Context, notifId: Int, title: String, body: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Rappels glycémie", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description      = "Rappels de mesure de glycémie"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
                enableLights(true)
                lightColor       = 0xFF388E3C.toInt()
            }
            nm.createNotificationChannel(ch)
        }

        val tapIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
            ?: Intent()

        val pi = PendingIntent.getActivity(
            context, notifId, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconRes = context.resources
            .getIdentifier("notification_icon", "drawable", context.packageName)
            .takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        nm.notify(notifId, notif)
    }

    private fun rescheduleNextDay(
        context: Context, notifId: Int, hour: Int, minute: Int, title: String, body: String
    ) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        AlarmSchedulerModule.scheduleExact(context, am, notifId, hour, minute, title, body)
    }
}
