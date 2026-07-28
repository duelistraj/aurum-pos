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
    public void acceptsFilesInsideDocumentsButRejectsSiblingPrefixes() throws IOException {
        File documents = temporaryFolder.newFolder("Documents");
        File invoice = new File(documents, "INV-100.pdf");
        File sibling = temporaryFolder.newFolder("Documents-private");
        File privateInvoice = new File(sibling, "INV-100.pdf");

        assertTrue(AurumFileNotificationsPlugin.isWithinDirectory(documents, invoice));
        assertFalse(AurumFileNotificationsPlugin.isWithinDirectory(documents, privateInvoice));
        assertFalse(AurumFileNotificationsPlugin.isWithinDirectory(documents, documents));
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
