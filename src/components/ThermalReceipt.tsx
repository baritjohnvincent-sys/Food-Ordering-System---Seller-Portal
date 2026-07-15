import React from 'react';
import { Order } from '../types';
import { Printer, Check, Copy } from 'lucide-react';

interface ThermalReceiptProps {
  order: Order;
  onClose: () => void;
}

export default function ThermalReceipt({ order, onClose }: ThermalReceiptProps) {
  const [copied, setCopied] = React.useState(false);

  const handlePrint = () => {
    // Generate simple print-friendly iframe or use browser print directly
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to preview printing.");
      return;
    }

    const itemsContent = order.items.map(item => `
      <tr>
        <td style="padding: 4px 0;">${item.name} x${item.qty}</td>
        <td style="text-align: right; padding: 4px 0;">₱${(item.qty * item.price).toFixed(2)}</td>
      </tr>
      ${item.notes ? `<tr><td colspan="2" style="font-size: 11px; color: #555; padding-bottom: 4px; font-style: italic;">* Notes: ${item.notes}</td></tr>` : ''}
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${order.orderNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 72mm; 
              margin: 0 auto; 
              padding: 10px;
              color: #000;
              background: #fff;
              font-size: 13px;
              line-height: 1.4;
            }
            .center { text-align: center; }
            .header { margin-bottom: 15px; }
            .title { font-size: 18px; font-weight: bold; margin: 0 0 5px 0; }
            .separator { border-top: 1px dashed #000; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; }
            .total { font-weight: bold; font-size: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="center header">
            <h1 class="title">FOOD ORDERING SYSTEM</h1>
            <div>Fast, Dynamic, Fresh</div>
            <div style="font-size: 11px;">Zone 4, Manila, Philippines</div>
          </div>
          
          <div class="separator"></div>
          
          <div><strong>Order:</strong> ${order.orderNumber}</div>
          <div><strong>Type:</strong> Seller POS Terminal</div>
          <div><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</div>
          <div><strong>Server:</strong> ${order.actionBy}</div>
          
          <div class="separator"></div>
          
          <table>
            <thead>
              <tr style="border-bottom: 1px dashed #000;">
                <th style="text-align: left; padding-bottom: 5px;">Item</th>
                <th style="text-align: right; padding-bottom: 5px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsContent}
            </tbody>
          </table>
          
          <div class="separator"></div>
          
          <table>
            <tr>
              <td>SUBTOTAL:</td>
              <td style="text-align: right;">₱${order.totalAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td>TAX (12%):</td>
              <td style="text-align: right;">Included</td>
            </tr>
            <tr class="total">
              <td>TOTAL:</td>
              <td style="text-align: right;">₱${order.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
          
          <div class="separator"></div>
          
          <div class="center" style="margin-top: 10px;">
            <div><strong>PAYMENT:</strong> ${order.paymentMethod.toUpperCase()} (${order.paymentStatus.toUpperCase()})</div>
            <div style="font-size: 10px; margin-top: 5px;">ID: ${order.id.slice(0, 8)}...</div>
          </div>
          
          <div class="footer">
            <p>Thank you for your order!</p>
            <p>Please come again.</p>
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const copyToClipboard = () => {
    const textData = `
FOOD ORDER RECEIPT
-----------------------------
Order: ${order.orderNumber}
Date: ${new Date(order.createdAt).toLocaleString()}
Server: ${order.actionBy}
-----------------------------
${order.items.map(item => `${item.name} x${item.qty} - ₱${(item.qty * item.price).toFixed(2)}`).join('\n')}
-----------------------------
TOTAL: ₱${order.totalAmount.toFixed(2)}
PAYMENT: ${order.paymentMethod.toUpperCase()}
STATUS: ${order.paymentStatus.toUpperCase()}
`;
    navigator.clipboard.writeText(textData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white text-black border border-neutral-300 w-full max-w-sm rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Actions panel */}
        <div className="bg-neutral-100 px-4 py-3 flex items-center justify-between border-b border-neutral-200 rounded-t-xl shrink-0">
          <span className="text-sm font-semibold text-neutral-700">POS Thermal Print Preview</span>
          <button 
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Paper Container */}
        <div className="overflow-y-auto p-6 bg-neutral-200 flex-1 flex justify-center">
          <div className="bg-white w-[72mm] min-h-[140mm] shadow-md p-4 text-[12px] font-mono text-black leading-normal flex flex-col relative border-t-4 border-amber-400">
            
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="text-lg font-bold tracking-wider m-0">FOOD ORDERING SYSTEM</h1>
              <p className="text-[10px] text-neutral-500">Fast, Dynamic, Fresh</p>
              <p className="text-[9px] text-neutral-400">Zone 4, Manila, Philippines</p>
            </div>

            {/* Dash separator */}
            <div className="border-t border-dashed border-black my-2"></div>

            {/* Info block */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>ORDER ID:</span>
                <span className="font-semibold">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>SERVER:</span>
                <span>{order.actionBy}</span>
              </div>
              <div className="flex justify-between">
                <span>DATE:</span>
                <span className="text-[10px]">{new Date(order.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Dash separator */}
            <div className="border-t border-dashed border-black my-3"></div>

            {/* Items Table */}
            <div className="space-y-2 flex-1">
              <div className="flex justify-between font-bold">
                <span>ITEM</span>
                <span>TOTAL</span>
              </div>
              <div className="border-t border-dashed border-black mb-1"></div>
              {order.items.map((item) => (
                <div key={item.id} className="text-[11px]">
                  <div className="flex justify-between">
                    <span>
                      {item.name} <span className="text-neutral-500">x{item.qty}</span>
                    </span>
                    <span>₱{(item.qty * item.price).toFixed(2)}</span>
                  </div>
                  {item.notes && (
                    <div className="text-[10px] text-neutral-500 italic pl-2">
                      * {item.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Dash separator */}
            <div className="border-t border-dashed border-black my-3 pt-2"></div>

            {/* Financial summaries */}
            <div className="space-y-1 text-sm font-semibold">
              <div className="flex justify-between text-xs">
                <span>SUBTOTAL:</span>
                <span>₱{order.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs font-normal">
                <span>VAT (12%):</span>
                <span>Included</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-dashed border-black pt-1">
                <span>GRAND TOTAL:</span>
                <span>₱{order.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Dese separator */}
            <div className="border-t border-dashed border-black my-3"></div>

            {/* Payment stamp */}
            <div className="text-center p-2 border border-black rounded-lg uppercase font-bold text-xs">
              PAYMENT : {order.paymentMethod} <br />
              [{order.paymentStatus}]
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-neutral-500 mt-6 space-y-1">
              <p>THANK YOU FOR YOUR PATRONAGE!</p>
              <p>Please come again & share your food experience!</p>
              <p className="text-[8px] text-neutral-400 mt-2">ID: {order.id}</p>
            </div>
          </div>
        </div>

        {/* Action Panel Footer */}
        <div className="bg-neutral-100 p-4 border-t border-neutral-200 flex items-center gap-3 shrink-0 rounded-b-xl">
          <button
            onClick={copyToClipboard}
            className="flex-1 py-2 px-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-600 animate-bounce" />
                Copied Table!
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy Text
              </>
            )}
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition shadow"
          >
            <Printer size={14} />
            Hardware Print
          </button>
        </div>

      </div>
    </div>
  );
}
