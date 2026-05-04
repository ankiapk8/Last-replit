package app.replit.ankigen;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (bridge != null && bridge.getWebView() != null) {
      WebSettings s = bridge.getWebView().getSettings();
      s.setUseWideViewPort(true);
      s.setLoadWithOverviewMode(true);
      s.setSupportZoom(false);
      s.setBuiltInZoomControls(false);
      s.setDisplayZoomControls(false);
      s.setTextZoom(100);
      bridge.getWebView().setInitialScale(0);
    }
  }
}
