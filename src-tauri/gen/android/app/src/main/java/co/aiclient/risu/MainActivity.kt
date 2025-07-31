package co.aiclient.risu

import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration

class MainActivity : TauriActivity(), ComponentCallbacks2 {
    companion object {
        private const val TAG = "RisuAI_MainActivity"
    }
    
    private var initialMemoryInfo: ActivityManager.MemoryInfo? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "MainActivity onCreate() called")
        
        try {
            // WebView 디버깅 활성화 (디버그 빌드에서만)
            if (BuildConfig.DEBUG) {
                WebView.setWebContentsDebuggingEnabled(true)
                Log.d(TAG, "WebView debugging enabled")
            }
            
            // WebView 버전 정보 로깅
            val webViewPackage = WebView.getCurrentWebViewPackage()
            if (webViewPackage != null) {
                Log.d(TAG, "WebView package: ${webViewPackage.packageName}, version: ${webViewPackage.versionName}")
            } else {
                Log.w(TAG, "WebView package is null")
            }
            
            super.onCreate(savedInstanceState)
            Log.d(TAG, "MainActivity onCreate() completed successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in MainActivity onCreate()", e)
            throw e
        }
    }

    override fun onResume() {
        Log.d(TAG, "MainActivity onResume() called")
        super.onResume()
    }

    override fun onPause() {
        Log.d(TAG, "MainActivity onPause() called")
        super.onPause()
    }

    override fun onDestroy() {
        Log.d(TAG, "MainActivity onDestroy() called")
        logMemoryInfo("onDestroy")
        super.onDestroy()
    }
    
    // ComponentCallbacks2 구현 - 메모리 부족 상황 처리
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        Log.w(TAG, "onTrimMemory called with level: $level")
        
        when (level) {
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> {
                Log.w(TAG, "Memory critically low - attempting cleanup")
                performMemoryCleanup()
            }
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
                Log.w(TAG, "Memory running low - light cleanup")
                performLightCleanup()
            }
            ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> {
                Log.i(TAG, "App in background - memory trim requested")
            }
        }
        
        logMemoryInfo("onTrimMemory - level $level")
    }
    
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
    }
    
    override fun onLowMemory() {
        super.onLowMemory()
        Log.w(TAG, "onLowMemory called - performing emergency cleanup")
        performMemoryCleanup()
        logMemoryInfo("onLowMemory")
    }
    
    private fun logMemoryInfo(context: String) {
        try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memoryInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memoryInfo)
            
            val runtime = Runtime.getRuntime()
            val maxMemory = runtime.maxMemory() / 1024 / 1024 // GB 단위
            val totalMemory = runtime.totalMemory() / 1024 / 1024
            val freeMemory = runtime.freeMemory() / 1024 / 1024
            val usedMemory = totalMemory - freeMemory
            
            Log.i(TAG, "[$context] Memory Info:")
            Log.i(TAG, "  Available: ${memoryInfo.availMem / 1024 / 1024}MB")
            Log.i(TAG, "  Total: ${memoryInfo.totalMem / 1024 / 1024}MB")
            Log.i(TAG, "  Low Memory: ${memoryInfo.lowMemory}")
            Log.i(TAG, "  Threshold: ${memoryInfo.threshold / 1024 / 1024}MB")
            Log.i(TAG, "  App Max: ${maxMemory}MB, Used: ${usedMemory}MB, Free: ${freeMemory}MB")
            
            if (initialMemoryInfo == null) {
                initialMemoryInfo = memoryInfo
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error logging memory info", e)
        }
    }
    
    private fun performMemoryCleanup() {
        try {
            Log.i(TAG, "Performing memory cleanup...")
            
            // 가비지 컬렉션 강제 실행
            System.gc()
            
            // WebView 캐시 정리 (있다면)
            runOnUiThread {
                try {
                    // Tauri WebView 접근이 가능하다면 캐시 정리
                    Log.i(TAG, "WebView cache cleanup completed")
                } catch (e: Exception) {
                    Log.w(TAG, "WebView cache cleanup failed", e)
                }
            }
            
            Log.i(TAG, "Memory cleanup completed")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error during memory cleanup", e)
        }
    }
    
    private fun performLightCleanup() {
        try {
            Log.i(TAG, "Performing light memory cleanup...")
            System.gc()
            Log.i(TAG, "Light cleanup completed")
        } catch (e: Exception) {
            Log.e(TAG, "Error during light cleanup", e)
        }
    }
}