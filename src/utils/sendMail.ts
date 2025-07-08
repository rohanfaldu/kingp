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



export const generateInvoicePdf = async (
  order: any,
  orderUserGstData: any,
  adminUser: any = null // Pass adminUser if it's a group order
): Promise<string> => {
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
    .text('Tax Invoice', 400, 50, { align: 'right' });

  // Invoice details under the title (right-aligned, spaced properly)
  let infoY = 75; // Start a little lower to avoid overlap

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(`Invoice no: ${order.invoiceId || order.id}`, 400, 80, { align: 'right' })
    .text(`Invoice date: ${new Date().toLocaleDateString()}`, 400, 95, { align: 'right' })
    .text(`Completion Date: ${order.completionDate ? new Date(order.completionDate).toLocaleDateString() : 'N/A'}`, 400, 110, { align: 'right' });


  // // ✅ From Section – Left side (Influencer or Group Info)
  // const senderName =
  //   order.influencerOrderData?.name || order.groupOrderData?.name || 'From Name';
  // const senderEmail =
  //   order.influencerOrderData?.emailAddress || 'N/A';
  // const senderPhone =
  //   order.influencerOrderData?.contactPersonPhoneNumber || 'N/A';
  // const senderCity =
  //   order.influencerOrderData?.cityData?.name || '';
  // const senderState =
  //   order.influencerOrderData?.stateData?.name || '';
  // const senderAddress = (senderCity && senderState)
  //   ? `${senderCity}, ${senderState}`
  //   : 'Address';

  const isGroupOrder = !!order.groupOrderData;

  const senderName = isGroupOrder
    ? 'KringP App'
    : order.influencerOrderData?.name || 'Influencer Name';

  const senderEmail = isGroupOrder
    ? 'info@kringp.com'
    : order.influencerOrderData?.emailAddress || 'N/A';

  const senderPhone = isGroupOrder
    ? ''
    : order.influencerOrderData?.contactPersonPhoneNumber || 'N/A';

  const senderCity = isGroupOrder
    ? ''
    : order.influencerOrderData?.cityData?.name || '';

  const senderState = isGroupOrder
    ? 'India'
    : order.influencerOrderData?.stateData?.name || '';

  const senderAddress = senderCity && senderState
    ? `${senderCity}, ${senderState}`
    : 'Address';



  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('From', 50, 150);

  doc
    .fontSize(14)
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text(senderName, 50, 170);

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(senderEmail, 50, 190)
    .text(senderPhone, 50, 205)
    .text(senderAddress, 50, 220)
    .text('India', 50, 235);


  // ✅ Bill To Section – Right side (Business Info)
  // doc
  //   .fontSize(12)
  //   .fillColor('#333')
  //   .font('Helvetica-Bold')
  //   .text('Bill to', 400, 150);

  // doc
  //   .fontSize(14)
  //   .fillColor('#000')
  //   .font('Helvetica-Bold')
  //   .text(order.businessOrderData?.name || 'Customer Name', 400, 170);

  // doc
  //   .fontSize(10)
  //   .fillColor('#666')
  //   .font('Helvetica')
  //   .text(order.businessOrderData?.emailAddress || 'customer@email.com', 400, 190)
  //   .text(order.businessOrderData?.contactPersonPhoneNumber || 'N/A', 400, 205)
  //   .text(
  //     (order.businessOrderData?.cityData?.name && order.businessOrderData?.stateData?.name)
  //       ? `${order.businessOrderData.cityData.name}, ${order.businessOrderData.stateData.name}`
  //       : 'Address',
  //     400, 220
  //   )
  //   .text('India', 400, 235);

  let billToY = 150;

  doc
    .fontSize(12)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text('Bill to', 400, billToY, { align: 'right' });

  billToY += 20;

  doc
    .fontSize(14)
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text(order.businessOrderData?.name || 'Customer Name', 400, billToY, { align: 'right' });

  billToY += 20;

  doc
    .fontSize(10)
    .fillColor('#666')
    .font('Helvetica')
    .text(order.businessOrderData?.emailAddress || 'customer@email.com', 400, billToY, { align: 'right' });

  billToY += 15;

  doc
    .text(order.businessOrderData?.contactPersonPhoneNumber || 'N/A', 400, billToY, { align: 'right' });

  billToY += 15;

  const cityState = (order.businessOrderData?.cityData?.name && order.businessOrderData?.stateData?.name)
    ? `${order.businessOrderData.cityData.name}, ${order.businessOrderData.stateData.name}`
    : 'Address';

  doc
    .text(cityState, 400, billToY, { align: 'right' });

  billToY += 15;

  doc
    .text('India', 400, billToY, { align: 'right' });



  // ✅ Centered Order ID – below both sections
  doc
    .fontSize(14) // slightly larger
    .fillColor('#000')
    .font('Helvetica-Bold')
    .text(`Order ID: ${order.orderId || order.id}`, 0, 310, {
      align: 'center',
    });



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
  // ✅ Table Header Background
  doc
    .rect(tableLeft, tableTop, tableWidth, 30)
    .fillColor('#4A90E2')
    .fill();

  // ✅ Table Header Text
  doc
    .fontSize(10)
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .text('Description', tableLeft + 10, tableTop + 10, { width: 180 })
    .text('HSN', tableLeft + 200, tableTop + 10, { width: 50, align: 'center' })
    .text('Unit Cost', tableLeft + 260, tableTop + 10, { width: 80, align: 'center' })
    .text('Discount', tableLeft + 340, tableTop + 10, { width: 80, align: 'center' })
    .text('Total', tableLeft + 420, tableTop + 10, { width: 80, align: 'center' });

  // ✅ Table Row Background
  let currentY = tableTop + 30;
  doc
    .rect(tableLeft, currentY, tableWidth, 50)
    .fillColor('#F8F9FA')
    .fill();

  // ✅ Description Text
  doc
    .fontSize(10)
    .fillColor('#333')
    .font('Helvetica-Bold')
    .text(order.title || 'Service', tableLeft + 10, currentY + 8, { width: 180 });

  doc
    .fontSize(9)
    .fillColor('#666')
    .font('Helvetica')
    .text(order.description || 'Service description', tableLeft + 10, currentY + 22, { width: 180 });

  // ✅ Vertical Lines
  const hsnX = tableLeft + 200;
  const unitCostX = tableLeft + 260;
  const discountX = tableLeft + 340;
  const totalX = tableLeft + 420;

  [hsnX, unitCostX, discountX, totalX].forEach(x => {
    doc
      .moveTo(x, currentY)
      .lineTo(x, currentY + 50)
      .stroke('#E5E5E5');
  });

  // ✅ Register and Use Font for ₹ symbol
  const fontPath = path.resolve(process.cwd(), 'src/fonts/NotoSans-Regular.ttf');
  const fontBoldPath = path.resolve(process.cwd(), 'src/fonts/NotoSans-Bold.ttf');
  doc.registerFont('NotoSans', fontPath);
  doc.registerFont('NotoSans-Bold', fontBoldPath);
  doc.font('NotoSans');

  // ✅ Table Values (HSN, Amounts)
  doc
    .fontSize(10)
    .fillColor('#333')
    .text('-', hsnX, currentY + 15, { width: 50, align: 'center' })
    .text(`₹${order.totalAmount?.toFixed(2) || '0.00'}`, unitCostX, currentY + 15, { width: 80, align: 'center' })
    .text(`₹${order.discountAmount?.toFixed(2) || '0.00'}`, discountX, currentY + 15, { width: 80, align: 'center' })
    .text(`₹${order.finalAmount?.toFixed(2) || '0.00'}`, totalX, currentY + 15, { width: 80, align: 'center' });

  // ✅ Advance row pointer for next section
  currentY += 50;

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
    .text(capitalizeStatus(order.paymentStatus) || 'Pending', 150, currentY + 50)
    .text('Transaction ID:', 50, currentY + 65)
    .text(order.transactionId || 'N/A', 150, currentY + 65)
    .text('Payment Method:', 50, currentY + 80)
    .text('Online Payment', 150, currentY + 80);

  // ✅ Summary Section (right side)
 // ✅ Summary Section (right-aligned)
const summaryRight = 550; // Right alignment edge
const summaryLabelWidth = 120;
const summaryValueWidth = 100;
const summaryX = summaryRight - summaryLabelWidth - summaryValueWidth; // e.g., 330
const summaryY = currentY + 50;

const gstData = order.orderUserGstData?.[0];
const gstAmount = gstData?.gst ? parseFloat(gstData.gst.toString()).toFixed(2) : '0.00';

// ✅ Labels (Right-aligned)
doc
  .font('NotoSans')
  .fontSize(10)
  .fillColor('#333')
  .text('Subtotal:', summaryX, summaryY, { width: summaryLabelWidth, align: 'right' })
  .text('Discount (0%):', summaryX, summaryY + 15, { width: summaryLabelWidth, align: 'right' })
  .text('GST:', summaryX, summaryY + 30, { width: summaryLabelWidth, align: 'right' });

// ✅ Values (Right-aligned)
doc
  .font('NotoSans-Bold')
  .fontSize(10)
  .fillColor('#333')
  .text(`₹${order.totalAmount?.toFixed(2) || '0.00'}`, summaryX + summaryLabelWidth, summaryY, { width: summaryValueWidth, align: 'right' })
  .text(`₹${order.discountAmount?.toFixed(2) || '0.00'}`, summaryX + summaryLabelWidth, summaryY + 15, { width: summaryValueWidth, align: 'right' })
  .text(`₹${gstAmount}`, summaryX + summaryLabelWidth, summaryY + 30, { width: summaryValueWidth, align: 'right' });

// ✅ Amount Paid (Bold)
doc
  .font('NotoSans-Bold')
  .fontSize(12)
  .fillColor('#333')
  .text('Amount paid:', summaryX, summaryY + 70, { width: summaryLabelWidth, align: 'right' })
  .text(`₹${order.finalAmount?.toFixed(2) || '0.00'}`, summaryX + summaryLabelWidth, summaryY + 70, { width: summaryValueWidth, align: 'right' });

// ✅ Notes Section (starts from left)
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
