package co.aiclient.risu

import android.os.Bundle
import android.util.Log
import android.webkit.WebView

class MainActivity : TauriActivity() {
    companion object {
        private const val TAG = "RisuAI_MainActivity"
    }

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
        super.onDestroy()
    }
}