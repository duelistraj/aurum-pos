package com.duelistraj.aurumpos;

import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

@CapacitorPlugin(name = "AurumPrinting")
public class AurumPrintingPlugin extends Plugin {
    @PluginMethod
    public void printPdf(PluginCall call) {
        String rawUri = call.getString("uri");
        String jobName = call.getString("jobName", "Aurum POS invoice");
        if (rawUri == null || rawUri.isBlank()) {
            call.reject("uri is required");
            return;
        }

        try {
            File pdf = resolveCachePdf(rawUri);
            PrintManager printManager = (PrintManager) getContext().getSystemService(
                android.content.Context.PRINT_SERVICE
            );
            if (printManager == null) {
                call.reject("Android printing is unavailable");
                return;
            }
            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build();
            printManager.print(jobName, new PdfPrintAdapter(pdf), attributes);
            call.resolve();
        } catch (IOException | IllegalArgumentException exception) {
            call.reject("Unable to print this PDF", exception);
        }
    }

    private File resolveCachePdf(String rawUri) throws IOException {
        Uri uri = Uri.parse(rawUri);
        if (uri.getScheme() != null && !"file".equals(uri.getScheme())) {
            throw new IllegalArgumentException("Only application cache files can be printed");
        }
        String path = uri.getScheme() == null ? rawUri : uri.getPath();
        if (path == null) {
            throw new IllegalArgumentException("Invalid PDF path");
        }
        File file = new File(path).getCanonicalFile();
        File cacheDirectory = getContext().getCacheDir().getCanonicalFile();
        String cachePrefix = cacheDirectory.getPath() + File.separator;
        if (
            !file.getPath().startsWith(cachePrefix) ||
            !file.getName().toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ||
            !file.isFile()
        ) {
            throw new IllegalArgumentException("Only application cache PDFs can be printed");
        }
        return file;
    }

    private static final class PdfPrintAdapter extends PrintDocumentAdapter {
        private final File pdf;

        private PdfPrintAdapter(File pdf) {
            this.pdf = pdf;
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            callback.onLayoutFinished(
                new PrintDocumentInfo.Builder(pdf.getName())
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build(),
                !newAttributes.equals(oldAttributes)
            );
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            try (
                FileInputStream input = new FileInputStream(pdf);
                FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())
            ) {
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    if (cancellationSignal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    output.write(buffer, 0, read);
                }
                callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (IOException exception) {
                callback.onWriteFailed(exception.getMessage());
            }
        }
    }
}
