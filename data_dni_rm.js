require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { format, addDays } = require('date-fns');

// Ensure env variables exist
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.RESEND_API_KEY) {
  throw new Error("Missing Supabase or Resend credentials in .env");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function checkDniAndSendEmails() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const inFiveDays = format(addDays(new Date(), 5), 'yyyy-MM-dd');

  console.log(`🔍 Checking for expirations from ${today} to ${inFiveDays}...`);

  const { data, error } = await supabase
    .from('employees')
    .select('full_name, email, dni_expiry_date, medical_recognition_date')
    .or(
      `and(dni_expiry_date.gte.${today},dni_expiry_date.lte.${inFiveDays}),and(medical_recognition_date.gte.${today},medical_recognition_date.lte.${inFiveDays})`
    );

  if (error) {
    console.error("❌ Supabase query error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("✅ No upcoming expirations in the next 5 days.");
    return;
  }

  console.log(`📨 Sending ${data.length} email(s)...`);

  for (const employee of data) {
    try {
      // Determine which dates are close
      const dniDue = employee.dni_expiry_date >= today && employee.dni_expiry_date <= inFiveDays;
      const medDue = employee.medical_recognition_date >= today && employee.medical_recognition_date <= inFiveDays;

      let htmlContent = `<p>Hi ${employee.full_name},</p>`;

      if (dniDue) {
        htmlContent += `<p>✅ Your <strong>DNI</strong> will expire on <strong>${employee.dni_expiry_date}</strong>.</p>`;
      }

      if (medDue) {
        htmlContent += `<p>🩺 Your <strong>Medical Recognition</strong> is due on <strong>${employee.medical_recognition_date}</strong>.</p>`;
      }

      htmlContent += `<p>Please take the necessary actions in time.</p>`;

      const response = await resend.emails.send({
        from: 'pre@kapitalfibra.es',
        to: employee.email,
        subject: 'Important Reminder: Upcoming Expiration(s)',
        html: htmlContent
      });

      console.log(`✅ Email sent to ${employee.email}`);
      console.log("📤 Resend response:", response);
    } catch (emailError) {
      console.error(`❌ Failed to send email to ${employee.email}:`, emailError.message);
      console.error(emailError);
    }
  }
}

// Run immediately
checkDniAndSendEmails();

// Then repeat every 1 minute
setInterval(() => {
  console.log(`⏱️  Rechecking at ${new Date().toLocaleTimeString()}...`);
  checkDniAndSendEmails();
}, 60 * 1000);
