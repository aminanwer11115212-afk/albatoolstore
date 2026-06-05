export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          balance: number | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          balance?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          balance?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          currency: string | null
          email: string | null
          id: string
          logo_url: string | null
          phone: string | null
          tax_number: string | null
          tax_rate: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name?: string
          created_at?: string
          currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_number?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_number?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          balance: number | null
          city: string | null
          company: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number | null
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number | null
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          discount: number | null
          id: string
          invoice_id: string
          product_id: string | null
          product_name: string
          quantity: number
          tax_rate: number | null
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number | null
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          tax_rate?: number | null
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number | null
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_rate?: number | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string | null
          date: string
          discount: number | null
          due_amount: number | null
          due_date: string | null
          exchange_rate: number | null
          id: string
          invoice_number: string
          notes: string | null
          paid_amount: number | null
          payment_method: string | null
          shipping: number | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          date?: string
          discount?: number | null
          due_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          shipping?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          date?: string
          discount?: number | null
          due_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          shipping?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          company_id: string | null
          created_at: string
          description: string | null
          discount_rate: number | null
          foreign_price: number | null
          id: string
          image_url: string | null
          min_stock: number | null
          name: string
          purchase_price: number | null
          sale_price: number | null
          sku: string | null
          stock_quantity: number | null
          tax_rate: number | null
          unit: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          discount_rate?: number | null
          foreign_price?: number | null
          id?: string
          image_url?: string | null
          min_stock?: number | null
          name: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          tax_rate?: number | null
          unit?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          discount_rate?: number | null
          foreign_price?: number | null
          id?: string
          image_url?: string | null
          min_stock?: number | null
          name?: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          tax_rate?: number | null
          unit?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          priority: string | null
          progress: number | null
          start_date: string | null
          status: string | null
          tag: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          status?: string | null
          tag?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          status?: string | null
          tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity?: number
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          order_number: string
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          tax_amount: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          order_number: string
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          order_number?: string
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          discount: number | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          quote_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number | null
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          quote_id: string
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          quote_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          customer_id: string | null
          date: string
          discount: number | null
          id: string
          notes: string | null
          quote_number: string
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          date?: string
          discount?: number | null
          id?: string
          notes?: string | null
          quote_number: string
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          date?: string
          discount?: number | null
          id?: string
          notes?: string | null
          quote_number?: string
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_return_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          stock_return_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          stock_return_id: string
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          stock_return_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_return_items_stock_return_id_fkey"
            columns: ["stock_return_id"]
            isOneToOne: false
            referencedRelation: "stock_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_returns: {
        Row: {
          created_at: string
          customer_id: string | null
          date: string
          id: string
          invoice_id: string | null
          reason: string | null
          return_number: string
          status: string | null
          total: number | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          date?: string
          id?: string
          invoice_id?: string | null
          reason?: string | null
          return_number: string
          status?: string | null
          total?: number | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          date?: string
          id?: string
          invoice_id?: string | null
          reason?: string | null
          return_number?: string
          status?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          date: string
          from_warehouse_id: string | null
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          to_warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          to_warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          to_warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          created_at: string
          credit: number | null
          customer_id: string | null
          date: string
          debit: number | null
          description: string | null
          id: string
          method: string | null
          reference_id: string | null
          supplier_id: string | null
          to_account_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string | null
          created_at?: string
          credit?: number | null
          customer_id?: string | null
          date?: string
          debit?: number | null
          description?: string | null
          id?: string
          method?: string | null
          reference_id?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          credit?: number | null
          customer_id?: string | null
          date?: string
          debit?: number | null
          description?: string | null
          id?: string
          method?: string | null
          reference_id?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transporters: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
