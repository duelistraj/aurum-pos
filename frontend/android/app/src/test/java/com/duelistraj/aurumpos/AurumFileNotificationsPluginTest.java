package com.duelistraj.aurumpos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;

public class AurumFileNotificationsPluginTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void acceptsFilesInsideAppOwnedDownloadRootsButRejectsSiblings() throws IOException {
        File cache = temporaryFolder.newFolder("cache");
        File externalFiles = temporaryFolder.newFolder("external-files");
        File cachedInvoice = new File(cache, "INV-100.pdf");
        File externalInvoice = new File(externalFiles, "INV-101.pdf");
        File sibling = temporaryFolder.newFolder("cache-private");
        File privateInvoice = new File(sibling, "INV-102.pdf");
        assertTrue(cachedInvoice.createNewFile());
        assertTrue(externalInvoice.createNewFile());
        assertTrue(privateInvoice.createNewFile());

        assertTrue(
            AurumFileNotificationsPlugin.isAllowedDownloadedFile(
                cache,
                externalFiles,
                cachedInvoice
            )
        );
        assertTrue(
            AurumFileNotificationsPlugin.isAllowedDownloadedFile(
                cache,
                externalFiles,
                externalInvoice
            )
        );
        assertFalse(
            AurumFileNotificationsPlugin.isAllowedDownloadedFile(
                cache,
                externalFiles,
                privateInvoice
            )
        );
        assertFalse(
            AurumFileNotificationsPlugin.isAllowedDownloadedFile(
                cache,
                externalFiles,
                cache
            )
        );
    }

    @Test
    public void derivesOnlySupportedDownloadMimeTypes() {
        assertEquals(
            "application/pdf",
            AurumFileNotificationsPlugin.mimeTypeFor(new File("invoice.PDF"))
        );
        assertEquals(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            AurumFileNotificationsPlugin.mimeTypeFor(new File("labels.xlsx"))
        );
        assertNull(AurumFileNotificationsPlugin.mimeTypeFor(new File("unexpected.html")));
    }
}
