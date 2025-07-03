import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import puppeteer from 'puppeteer';


dotenv.config();

// Define the structure of the email options
type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

// Configure the transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// General-purpose email sender
export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  const mailOptions = {
    from: `"KringP App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    return (info.accepted.length > 0) ? true : false;
    //return info.response;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}



const resend = new Resend('re_FKsFJzvk_4L1x2111AwnSDMqGCYGsLJeH');

/**
 * Send an email with optional PDF attachment.
 * 
 * @param to Email address to send to
 * @param subject Subject of the email
 * @param html HTML content of the email
 * @param pdfPath Optional path to a PDF file to attach
 */
export const sendEmailWithOptionalPdf = async (
  to: string,
  subject: string,
  html: string,
  pdfPath?: string
) => {
  const attachments: any[] = [];

  if (pdfPath) {
    const fileName = path.basename(pdfPath);
    const pdfData = fs.readFileSync(pdfPath).toString('base64');

    attachments.push({
      filename: fileName,
      content: pdfData,
      contentType: 'application/pdf',
    });
  }

  const result = await resend.emails.send({
    from: 'KringP <info@kringp.com>',
    to,
    subject,
    html,
    attachments,
  });

  return result;
};



export const generateInvoicePdf = async (order: any): Promise<string> => {
  // Use invoiceId in filename if available
  const fileName = `invoice-${order.invoiceId || order.id}.pdf`;

  // Build absolute paths
  const uploadDir = path.resolve(__dirname, '../uploads/documents');
  const pdfPath = path.join(uploadDir, fileName);

  const capitalizeStatus = (text: string) =>
    text?.charAt(0).toUpperCase() + text?.slice(1).toLowerCase();



  // ✅ Ensure the folder exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // ✅ Create PDF document
  const doc = new PDFDocument({ margin: 50 });

  // ✅ Pipe PDF stream to file
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  // ✅ Header Section - Logo and Digital Invoice
  const logoPath = path.resolve(__dirname, '../uploads/images/Logowebsite(1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 30, { width: 80 });
  }

  // Digital Invoice Title (top-right)
  doc
    .fontSize(20)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Digital Invoice', 400, 50, { align: 'right' });

  // Invoice details under the title (right-aligned, spaced properly)
  let infoY = 75; // Start a little lower to avoid overlap

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(`Order ID: ${order.orderId || '-'}`, 400, infoY, { align: 'right' });

  infoY += 15;
  doc.text(`Invoice no: ${order.invoiceId || order.id}`, 400, infoY, { align: 'right' });

  infoY += 15;
  doc.text(`Invoice date: ${new Date().toLocaleDateString()}`, 400, infoY, { align: 'right' });

  infoY += 15;
  doc.text(`Completion Date: ${order.completionDate ? new Date(order.completionDate).toLocaleDateString() : 'N/A'}`, 400, infoY, { align: 'right' });


  // ✅ From Section
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('From', 50, 150);

  doc
    .fontSize(14)
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text('KringP Apps', 50, 170);

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text('info@kringp.com', 50, 190)
    .text('https://kringp.com/', 50, 205)
    .text('+91 XXXXXXXXXX', 50, 220)
    .text('India', 50, 235);

  // ✅ Bill To Section
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Bill to', 400, 150);

  doc
    .fontSize(14)
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text(order.businessOrderData?.name || 'Customer Name', 400, 170);

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(order.businessOrderData?.emailAddress || 'customer@email.com', 400, 190)
    .text(order.businessOrderData?.contactPersonPhoneNumber || 'N/A', 400, 205)
    .text((order.businessOrderData?.cityData?.name && order.businessOrderData?.stateData?.name) ? `${order.businessOrderData.cityData.name}, ${order.businessOrderData.stateData.name}` : 'Address', 400, 220);


  // ✅ Ship To Section (if different from Bill To)
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Ship to', 400, 260);

  // Ship To / Group Section
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Ship to / Group', 400, 260);

  if (order.groupOrderData) {
    // If it’s a group order, show the group name
    doc
      .fontSize(10)
      .fillColor('#666')
      .font('Helvetica')
      .text(order.groupOrderData.groupName, 400, 280);
  } else {
    // Otherwise fall back to the influencer “ship to” block
    doc
      .fontSize(10)
      .fillColor('#666')
      .font('Helvetica')
      .text(order.influencerOrderData?.name || 'Same as billing', 400, 280)
      .text(order.influencerOrderData?.emailAddress || '', 400, 295)
      .text(order.influencerOrderData?.contactPersonPhoneNumber || 'N/A', 400, 310)
      .text((order.influencerOrderData?.cityData?.name && order.influencerOrderData?.stateData?.name) ? `${order.influencerOrderData.cityData.name}, ${order.influencerOrderData.stateData.name}` : 'Address', 400, 220);

  }

  // …then your table header…
  const tableTop = 350;
  const tableLeft = 50;
  const tableWidth = 500;
  // etc.

  // Table header background
  doc
    .rect(tableLeft, tableTop, tableWidth, 30)
    .fillColor('#4A90E2')
    .fill();

  // Table header text
  doc
    .fontSize(10)
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .text('Description', tableLeft + 10, tableTop + 10, { width: 250 })
    .text('Unit Cost', tableLeft + 270, tableTop + 10, { width: 80 })
    .text('Discount', tableLeft + 360, tableTop + 10, { width: 80, align: 'left' })
    .text('Total', tableLeft + 450, tableTop + 10, { width: 120 });

  // ✅ Table Rows
  let currentY = tableTop + 30;

  // Service row
  doc
    .rect(tableLeft, currentY, tableWidth, 50)
    .fillColor('#F8F9FA')
    .fill();

  doc
    .fontSize(10)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text(order.title || 'Service', tableLeft + 10, currentY + 8, { width: 250 });

  doc
    .fontSize(9)
    .fillColor('#666')
    .font('Helvetica')
    .text(order.description || 'Service description', tableLeft + 10, currentY + 22, { width: 250 });

  // Add vertical lines for table structure
  const columnWidth = 80; // Equal width for all columns
  const totalAmountX = tableLeft + 260;
  const discountAmountX = totalAmountX + columnWidth;
  const finalAmountX = discountAmountX + columnWidth;

  // Draw vertical lines for the table structure
  doc
    .moveTo(totalAmountX, currentY)
    .lineTo(totalAmountX, currentY + 50)
    .stroke('#E5E5E5');

  doc
    .moveTo(discountAmountX, currentY)
    .lineTo(discountAmountX, currentY + 50)
    .stroke('#E5E5E5');

  doc
    .moveTo(finalAmountX, currentY)
    .lineTo(finalAmountX, currentY + 50)
    .stroke('#E5E5E5');

  const fontPath = path.resolve(process.cwd(), 'src/fonts/NotoSans-Regular.ttf');
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');

  // Draw the text in the columns using a font that supports ₹
  doc
    .font('NotoSans')       // make sure you registered this earlier
    .fontSize(10)
    .fillColor('#333')
    .text(`\u20B9${order.totalAmount?.toFixed(2) || '0.00'}`, totalAmountX, currentY + 15, {
      width: columnWidth,
      align: 'center',
    })
    .text(`\u20B9${order.discountAmount?.toFixed(2) || '0.00'}`, discountAmountX, currentY + 15, {
      width: columnWidth,
      align: 'center',
    })
    .text(`\u20B9${order.finalAmount?.toFixed(2) || '0.00'}`, finalAmountX, currentY + 15, {
      width: columnWidth,
      align: 'center',
    });

  // Move down for the next row
  currentY += 40;



  // ✅ Payment Instructions
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Payment Instruction', 50, currentY + 30);

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text('Payment Status:', 50, currentY + 50)
    // .text(order.paymentStatus || 'Pending', 150, currentY + 50)
    .text(capitalizeStatus(order.paymentStatus) || 'Pending', 150, currentY + 50)
    .text('Transaction ID:', 50, currentY + 65)
    .text(order.transactionId || 'N/A', 150, currentY + 65)
    .text('Payment Method:', 50, currentY + 80)
    .text('Online Payment', 150, currentY + 80);

  // ✅ Summary Section (right side)
  const summaryX = 300;
  const summaryY = currentY + 50;

  doc
    .font('NotoSans')
    .fontSize(10)
    .fillColor('#333')
    .text('Subtotal:', summaryX, summaryY)
    .text('Discount (0%):', summaryX, summaryY + 15);

  doc
    .font('NotoSans')       // make sure you registered this earlier
    .fontSize(10)
    .fillColor('#333')
    .text(`\u20B9${order.totalAmount?.toFixed(2) || '0.00'}`, summaryX + 150, summaryY)
    .text(`\u20B9${order.discountAmount?.toFixed(2) || '0.00'}`, summaryX + 150, summaryY + 15);

  // Balance Due
  doc
    .font('NotoSans')
    .fontSize(12)
    .fillColor('#333')
    .text('Amount paid:', summaryX, summaryY + 85)
    .text(`\u20B9${order.finalAmount?.toFixed(2) || '0.00'}`, summaryX + 150, summaryY + 85);

  // ✅ Notes Section
  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Notes', 50, summaryY + 120);

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text('Thank you for choosing KringP! This invoice represents the completion of your order.', 50, summaryY + 140, { width: 400 })
    .text('For any queries, please contact our support team.', 50, summaryY + 155, { width: 400 });

  // ✅ Signature Line
  doc
    .moveTo(400, summaryY + 200)
    .lineTo(550, summaryY + 200)
    .stroke()
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text('Authorized Signature', 425, summaryY + 210);

  // ✅ Footer
  doc
    .fontSize(8)
    .fillColor('#999')
    .font('Helvetica-Oblique')
    .text('This is a computer-generated invoice and does not require a physical signature.', 50, doc.page.height - 50, { align: 'center' });

  // ✅ Finalize PDF
  doc.end();

  // ✅ Wait for file to be fully written before returning path
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return pdfPath;
};






// export const generateInvoicePdf = async (order: any): Promise<string> => {
//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();

//   const htmlTemplatePath = path.join(__dirname, '../templates/invoice.html');
//   const rawHtml = fs.readFileSync(htmlTemplatePath, 'utf-8');

//   // Generate dynamic rows
//   const itemRows = (order.items || []).map((item: any) => `
//     <tr>
//       <td>${item.name || 'Unnamed Item'}</td>
//       <td>${item.quantity ?? 1}</td>
//       <td>₹${(item.price ?? 0).toFixed(2)}</td>
//       <td>₹${(item.discount ?? 0).toFixed(2)}</td>
//       <td>₹${((item.price ?? 0) - (item.discount ?? 0)).toFixed(2)}</td>
//     </tr>
//   `).join('');

//   // Replace placeholders
//   const filledHtml = rawHtml
//     .replace('{{sellerName}}', order.sellerName || 'Seller Name')
//     .replace('{{sellerWebsite}}', order.sellerWebsite || 'https://example.com')
//     .replace('{{platform}}', 'KringP')
//     .replace('{{sellerAddress}}', order.sellerAddress || 'Seller Address')
//     .replace('{{vatNumber}}', order.vatNumber || 'N/A')
//     .replace('{{buyerEmail}}', order.buyerEmail || 'buyer@example.com')
//     .replace('{{transactionId}}', order.transactionId || 'N/A')
//     .replace('{{paymentDate}}', new Date(order.paymentDate).toLocaleString())
//     .replace('{{orderItems}}', itemRows)
//     .replace('{{subtotal}}', `₹${(order.subtotal ?? 0).toFixed(2)}`)
//     .replace('{{total}}', `₹${(order.total ?? 0).toFixed(2)}`)
//     .replace('{{notes}}', order.notes || 'Thank you for your business.');

//   await page.setContent(filledHtml, { waitUntil: 'networkidle0' });

//   const outputPath = path.resolve(__dirname, `../uploads/documents/invoice-${order.invoiceId || order.id}.pdf`);
//   await page.pdf({ path: outputPath, format: 'A4', printBackground: true });

//   await browser.close();

//   return outputPath;
// };
