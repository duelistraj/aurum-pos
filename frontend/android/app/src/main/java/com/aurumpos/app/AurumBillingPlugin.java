package com.duelistraj.aurumpos;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "AurumBilling")
public class AurumBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private PluginCall purchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .enableAutoServiceReconnection()
            .build();
    }

    private void withConnection(PluginCall call, Runnable action) {
        if (billingClient.isReady()) {
            action.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    call.reject("Google Play Billing is unavailable: " + result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                call.reject("Google Play Billing disconnected");
            }
        });
    }

    private QueryProductDetailsParams productQuery(String productId) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build();
        return QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(product))
            .build();
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }
        withConnection(call, () -> billingClient.queryProductDetailsAsync(
            productQuery(productId),
            (result, queryResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.getDebugMessage());
                    return;
                }
                JSArray products = new JSArray();
                for (ProductDetails details : queryResult.getProductDetailsList()) {
                    JSObject product = new JSObject();
                    product.put("productId", details.getProductId());
                    product.put("title", details.getTitle());
                    product.put("description", details.getDescription());
                    JSArray offers = new JSArray();
                    List<ProductDetails.SubscriptionOfferDetails> offerDetails =
                        details.getSubscriptionOfferDetails();
                    if (offerDetails != null) {
                        for (ProductDetails.SubscriptionOfferDetails offer : offerDetails) {
                            JSObject value = new JSObject();
                            value.put("basePlanId", offer.getBasePlanId());
                            value.put("offerToken", offer.getOfferToken());
                            List<ProductDetails.PricingPhase> phases =
                                offer.getPricingPhases().getPricingPhaseList();
                            if (!phases.isEmpty()) {
                                ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                                value.put("formattedPrice", phase.getFormattedPrice());
                                value.put("billingPeriod", phase.getBillingPeriod());
                            }
                            offers.put(value);
                        }
                    }
                    product.put("offers", offers);
                    products.put(product);
                }
                JSObject response = new JSObject();
                response.put("products", products);
                call.resolve(response);
            }
        ));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String basePlanId = call.getString("basePlanId");
        String accountId = call.getString("obfuscatedAccountId");
        String profileId = call.getString("obfuscatedProfileId");
        if (productId == null || basePlanId == null || accountId == null || profileId == null) {
            call.reject("Product, base plan, account, and profile identifiers are required");
            return;
        }
        withConnection(call, () -> billingClient.queryProductDetailsAsync(
            productQuery(productId),
            (result, queryResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || queryResult.getProductDetailsList().isEmpty()) {
                    call.reject("Subscription product is unavailable");
                    return;
                }
                ProductDetails details = queryResult.getProductDetailsList().get(0);
                ProductDetails.SubscriptionOfferDetails selected = null;
                if (details.getSubscriptionOfferDetails() != null) {
                    for (ProductDetails.SubscriptionOfferDetails offer : details.getSubscriptionOfferDetails()) {
                        if (basePlanId.equals(offer.getBasePlanId())) selected = offer;
                    }
                }
                if (selected == null) {
                    call.reject("Subscription base plan is unavailable");
                    return;
                }
                BillingFlowParams.ProductDetailsParams productParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(selected.getOfferToken())
                        .build();
                BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParams))
                    .setObfuscatedAccountId(accountId)
                    .setObfuscatedProfileId(profileId)
                    .build();
                purchaseCall = call;
                BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flow);
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    purchaseCall = null;
                    call.reject(launchResult.getDebugMessage());
                }
            }
        ));
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        if (purchaseCall == null) return;
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
            || purchases == null || purchases.isEmpty()) {
            purchaseCall.reject(result.getDebugMessage());
            purchaseCall = null;
            return;
        }
        JSObject response = purchaseToJson(purchases.get(0));
        purchaseCall.resolve(response);
        purchaseCall = null;
    }

    @PluginMethod
    public void restore(PluginCall call) {
        withConnection(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.getDebugMessage());
                    return;
                }
                JSArray values = new JSArray();
                for (Purchase purchase : purchases) values.put(purchaseToJson(purchase));
                JSObject response = new JSObject();
                response.put("purchases", values);
                call.resolve(response);
            }
        ));
    }

    private JSObject purchaseToJson(Purchase purchase) {
        JSObject value = new JSObject();
        value.put("purchaseToken", purchase.getPurchaseToken());
        value.put("purchaseState", purchase.getPurchaseState());
        value.put("acknowledged", purchase.isAcknowledged());
        return value;
    }
}
