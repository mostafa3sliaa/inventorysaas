"use client";

import { useRef } from "react";
import Barcode from "react-barcode";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintBarcodeButton({ sku, productName }: { sku: string; productName: string }) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    // We render a simple HTML page with the barcode image and product name
    printWindow.document.write(`
      <html>
        <head>
          <title>طباعة باركود</title>
          <style>
            body { 
              margin: 0; 
              padding: 10px; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              font-family: sans-serif;
            }
            .barcode-container {
              text-align: center;
              border: 1px solid #ccc;
              padding: 10px;
              border-radius: 8px;
            }
            @media print {
              @page { margin: 0; }
              body { padding: 5px; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-container">
            <h3 style="margin: 0 0 10px 0; font-size: 14px;">${productName}</h3>
            <svg id="barcode"></svg>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            JsBarcode("#barcode", "${sku}", {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: true
            });
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handlePrint}
      className="h-6 px-2 text-[10px] gap-1 border-gray-200 dark:border-white/[0.08]"
    >
      <Printer className="w-3 h-3" />
      طباعة الباركود
    </Button>
  );
}
