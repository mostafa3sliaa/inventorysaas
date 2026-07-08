"use client";

import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Package, AlertTriangle, Search } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/components/shared/TenantProvider";

export default function InventoryPage() {
  const { tenant } = useTenant();
  const [products, setProducts] = useState<any[]>([]);
  const [productsLimit, setProductsLimit] = useState(50);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const supabase = createClient();

  useEffect(() => {
    fetchProducts(productsLimit);
  }, [productsLimit]);

  const fetchProducts = async (currentLimit = productsLimit) => {
    setLoading(true);
    // Fetch products along with their variants
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        product_variants (*)
      `)
      .order("created_at", { ascending: false })
      .limit(currentLimit);
      
    if (error) {
      toast.error("فشل في جلب المخزون");
    } else {
      setProducts(data || []);
      setHasMoreProducts((data?.length || 0) >= currentLimit);
    }
    setLoading(false);
  };

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    if (product.name?.toLowerCase().includes(query)) return true;
    if (product.category?.toLowerCase().includes(query)) return true;
    
    if (product.product_variants?.some((v: any) => 
      v.sku?.toLowerCase().includes(query) || 
      v.barcode?.toLowerCase().includes(query) ||
      v.size?.toLowerCase().includes(query) ||
      v.color?.toLowerCase().includes(query)
    )) {
      return true;
    }
    
    return false;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">المخزون</h2>
          <p className="text-sm text-gray-500 mt-1">إدارة منتجاتك وكمياتها</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            type="text" 
            placeholder="ابحث باسم المنتج، الصنف، الباركود..." 
            className="pl-3 pr-9 h-10 w-full bg-white dark:bg-[#1E293B] rounded-lg border-gray-200 dark:border-white/[0.08] focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right font-bold text-gray-900">المنتج</TableHead>
              <TableHead className="text-right font-bold text-gray-900">التصنيف</TableHead>
              <TableHead className="text-right font-bold text-gray-900">التنويعات (مقاس / لون)</TableHead>
              <TableHead className="text-center font-bold text-gray-900">إجمالي المخزون</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 font-bold text-gray-500">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 font-bold text-gray-500">
                  {searchQuery ? "لم يتم العثور على منتجات مطابقة للبحث" : "لا يوجد منتجات في المخزون"}
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-gray-400" />
                      {product.name}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-gray-700">{product.category}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      {product.product_variants?.map((v: any, index: number, arr: any[]) => {
                        const baseline = Number(v.baseline_stock) || 1;
                        const ratio = Number(v.stock_quantity) / baseline;
                        const isLowStock = ratio <= 0.20;
                        const variantName = [v.size, v.color].filter(c => c && c !== "-").join(" / ") || "أساسي";
                        const isSingleVariant = arr.length === 1;
                        
                        let alertText = "مخزون منخفض";
                        if (ratio <= 0) alertText = "نفذ المخزون (0%)";
                        else if (ratio <= 0.1) alertText = "متبقي 10% أو أقل";
                        else if (ratio <= 0.2) alertText = "متبقي 20% أو أقل";
                        
                        return (
                          <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] p-2.5 rounded-lg hover:bg-gray-100/50 dark:hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900 dark:text-gray-200">
                                {variantName}
                              </span>

                              {v.barcode && <span className="text-[10px] text-gray-400 font-mono bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] px-1.5 py-0.5 rounded">{v.barcode}</span>}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {isLowStock && (
                                <Badge variant="destructive" className="text-[10px] py-0 h-5 px-2 flex items-center gap-1 font-semibold bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                                  <AlertTriangle className="w-3 h-3" />
                                  {alertText}
                                </Badge>
                              )}
                              {!isSingleVariant && (
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 border-0 text-xs px-3 font-semibold">
                                  {v.stock_quantity} قطعة
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="font-black text-center text-xl text-gray-900">
                    {product.product_variants?.reduce((acc: number, curr: any) => acc + (curr.stock_quantity || 0), 0) || 0}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {hasMoreProducts && !searchQuery && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => setProductsLimit(prev => prev + 50)}
              disabled={loading}
              className="bg-white hover:bg-gray-50 text-indigo-600 border-indigo-200"
            >
              {loading ? "جاري التحميل..." : "تحميل المزيد من المنتجات"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
