import { pool } from "../src/db.js";
import {
  emailConfiguration,
  enqueueDailyDigests,
  processEmailQueue,
} from "../src/services/emailService.js";

try {
  const config = emailConfiguration();
  if (!config.configured) {
    throw new Error(
      "El correo no está configurado. Revisa SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM."
    );
  }
  const digest = await enqueueDailyDigests();
  let processed = 0;
  let sent = 0;
  let failed = 0;
  do {
    const result = await processEmailQueue();
    processed = result.processed;
    sent += result.sent;
    failed += result.failed;
  } while (processed > 0);
  console.log(JSON.stringify({ digest, sent, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
