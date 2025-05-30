// app/api/check-expiry/route.js

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { format, addDays } from 'date-fns';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const inFiveDays = format(addDays(new Date(), 5), 'yyyy-MM-dd');

  console.log(`🔍 API call: checking expirations from ${today} to ${inFiveDays}`);

  const { data, error } = await supabase
    .from('employees')
    .select('full_name, email, dni_expiry_date, medical_recognition_date')
    .or(
      `and(dni_expiry_date.gte.${today},dni_expiry_date.lte.${inFiveDays}),and(medical_recognition_date.gte.${today},medical_recognition_date.lte.${inFiveDays})`
    );

  if (error) {
    console.error("❌ Supabase error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ status: 'ok', message: 'No upcoming expirations in 5 days.' });
  }

  const results = [];

  for (const employee of data) {
    try {
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
        html: htmlContent,
      });

      results.push({ email: employee.email, status: 'sent', id: response.id });
    } catch (err) {
      console.error(`❌ Error sending email to ${employee.email}:`, err);
      results.push({ email: employee.email, status: 'error', message: err.message });
    }
  }

  return NextResponse.json({ status: 'done', processed: results.length, results });
}
