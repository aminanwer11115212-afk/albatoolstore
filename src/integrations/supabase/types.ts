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
          bank_name: string | null
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
          bank_name?: string | null
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
          bank_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          changed_by: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      billing_terms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          created_at: string
          id: string
          name: string
          state_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          state_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          state_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          currency: string | null
          email: string | null
          iban: string | null
          id: string
          invoice_footer: string | null
          invoice_notes: string | null
          invoice_prefix: string | null
          logo_url: string | null
          payment_terms_days: number | null
          phone: string | null
          postbox: string | null
          purchase_prefix: string | null
          quote_prefix: string | null
          recurring_prefix: string | null
          region: string | null
          return_prefix: string | null
          show_discount: boolean | null
          show_shipping: boolean | null
          show_tax: boolean | null
          side_quote_prefix: string | null
          tax_number: string | null
          transaction_prefix: string | null
          updated_at: string
          website: string | null
          workflow_automation_enabled: boolean
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_notes?: string | null
          invoice_prefix?: string | null
          logo_url?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          postbox?: string | null
          purchase_prefix?: string | null
          quote_prefix?: string | null
          recurring_prefix?: string | null
          region?: string | null
          return_prefix?: string | null
          show_discount?: boolean | null
          show_shipping?: boolean | null
          show_tax?: boolean | null
          side_quote_prefix?: string | null
          tax_number?: string | null
          transaction_prefix?: string | null
          updated_at?: string
          website?: string | null
          workflow_automation_enabled?: boolean
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_notes?: string | null
          invoice_prefix?: string | null
          logo_url?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          postbox?: string | null
          purchase_prefix?: string | null
          quote_prefix?: string | null
          recurring_prefix?: string | null
          region?: string | null
          return_prefix?: string | null
          show_discount?: boolean | null
          show_shipping?: boolean | null
          show_tax?: boolean | null
          side_quote_prefix?: string | null
          tax_number?: string | null
          transaction_prefix?: string | null
          updated_at?: string
          website?: string | null
          workflow_automation_enabled?: boolean
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimal_places: number
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_destinations: {
        Row: {
          created_at: string
          customer_id: string
          destination_id: string
          id: string
          is_default: boolean | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          destination_id: string
          id?: string
          is_default?: boolean | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          destination_id?: string
          id?: string
          is_default?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_destinations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
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
      customer_preferred_transporter: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          transporter_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          transporter_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          transporter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferred_transporter_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_preferred_transporter_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_transporters: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          transporter_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          transporter_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_transporters_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_transporters_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number | null
          city: string | null
          city_id: string | null
          company: string | null
          created_at: string
          created_by_uid: string | null
          credit_balance: number
          email: string | null
          group_id: string | null
          id: string
          locality_id: string | null
          name: string
          notes: string | null
          phone: string | null
          region_id: string | null
          state_id: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          balance?: number | null
          city?: string | null
          city_id?: string | null
          company?: string | null
          created_at?: string
          created_by_uid?: string | null
          credit_balance?: number
          email?: string | null
          group_id?: string | null
          id?: string
          locality_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          region_id?: string | null
          state_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          balance?: number | null
          city?: string | null
          city_id?: string | null
          company?: string | null
          created_at?: string
          created_by_uid?: string | null
          credit_balance?: number
          email?: string | null
          group_id?: string | null
          id?: string
          locality_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          region_id?: string | null
          state_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      data_anomalies: {
        Row: {
          category: string
          created_at: string
          description: string
          detected_at: string
          id: string
          ignored_at: string | null
          ignored_by: string | null
          ignored_reason: string | null
          last_seen_at: string
          observed_value: Json | null
          record_id: string | null
          record_label: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_code: string
          severity: string
          status: string
          table_name: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          detected_at?: string
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          ignored_reason?: string | null
          last_seen_at?: string
          observed_value?: Json | null
          record_id?: string | null
          record_label?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code: string
          severity: string
          status?: string
          table_name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          detected_at?: string
          id?: string
          ignored_at?: string | null
          ignored_by?: string | null
          ignored_reason?: string | null
          last_seen_at?: string
          observed_value?: Json | null
          record_id?: string | null
          record_label?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code?: string
          severity?: string
          status?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_anomaly_runs: {
        Row: {
          anomalies_found: number | null
          anomalies_new: number | null
          anomalies_resolved: number | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          rules_run: number | null
          started_at: string
          status: string | null
          triggered_by: string
          triggered_by_uid: string | null
        }
        Insert: {
          anomalies_found?: number | null
          anomalies_new?: number | null
          anomalies_resolved?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rules_run?: number | null
          started_at?: string
          status?: string | null
          triggered_by?: string
          triggered_by_uid?: string | null
        }
        Update: {
          anomalies_found?: number | null
          anomalies_new?: number | null
          anomalies_resolved?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rules_run?: number | null
          started_at?: string
          status?: string | null
          triggered_by?: string
          triggered_by_uid?: string | null
        }
        Relationships: []
      }
      deleted_invoice_items: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          discount: number | null
          discount_value: number | null
          foreign_price: number | null
          format_discount: string | null
          full_data: Json | null
          id: string
          invoice_id: string | null
          original_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          tax_status: string | null
          total: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          full_data?: Json | null
          id?: string
          invoice_id?: string | null
          original_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          tax_status?: string | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          full_data?: Json | null
          id?: string
          invoice_id?: string | null
          original_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          tax_status?: string | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: []
      }
      deleted_quote_items: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          discount: number | null
          discount_value: number | null
          foreign_price: number | null
          format_discount: string | null
          full_data: Json | null
          id: string
          original_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          quote_id: string | null
          tax_status: string | null
          total: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          full_data?: Json | null
          id?: string
          original_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          quote_id?: string | null
          tax_status?: string | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          full_data?: Json | null
          id?: string
          original_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          quote_id?: string | null
          tax_status?: string | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: []
      }
      destination_transporters: {
        Row: {
          created_at: string
          destination_id: string
          id: string
          transporter_id: string
        }
        Insert: {
          created_at?: string
          destination_id: string
          id?: string
          transporter_id: string
        }
        Update: {
          created_at?: string
          destination_id?: string
          id?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "destination_transporters_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destination_transporters_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          doc_id: string
          doc_type: string
          expires_at: string
          hidden_sections: Json
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_id: string
          doc_type: string
          expires_at: string
          hidden_sections?: Json
          id?: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_id?: string
          doc_type?: string
          expires_at?: string
          hidden_sections?: Json
          id?: string
          token?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          description: string | null
          file_type: string | null
          file_url: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          email: string | null
          id: string
          login_enabled: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          salary: number | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          login_enabled?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          login_enabled?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency_code: string
          effective_date: string
          id: string
          notes: string | null
          rate_to_base: number
        }
        Insert: {
          created_at?: string
          currency_code: string
          effective_date?: string
          id?: string
          notes?: string | null
          rate_to_base: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          effective_date?: string
          id?: string
          notes?: string | null
          rate_to_base?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          period: string
          start_date: string | null
          target_expenses: number | null
          target_net_income: number | null
          target_revenue: number | null
          target_sales: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          period?: string
          start_date?: string | null
          target_expenses?: number | null
          target_net_income?: number | null
          target_revenue?: number | null
          target_sales?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          period?: string
          start_date?: string | null
          target_expenses?: number | null
          target_net_income?: number | null
          target_revenue?: number | null
          target_sales?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_attachments: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          expires_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          invoice_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          invoice_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          invoice_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          category_id: string | null
          created_at: string
          discount: number | null
          discount_value: number | null
          foreign_price: number | null
          format_discount: string | null
          id: string
          invoice_id: string
          product_id: string | null
          product_name: string
          quantity: number
          tax_status: string | null
          total: number
          unit: string | null
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          tax_status?: string | null
          total: number
          unit?: string | null
          unit_price: number
          warehouse_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_status?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
          warehouse_id?: string | null
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
          {
            foreignKeyName: "invoice_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_packaging: {
        Row: {
          cost: number | null
          created_at: string
          dimensions: string | null
          id: string
          invoice_id: string
          notes: string | null
          packaging_type_id: string | null
          packs_count: number
          pieces_per_pack: number
          quantity: number
          weight: number | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          quantity?: number
          weight?: number | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          quantity?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_packaging_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_packaging_packaging_type_id_fkey"
            columns: ["packaging_type_id"]
            isOneToOne: false
            referencedRelation: "packaging_types"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_revisions: {
        Row: {
          action: string
          changed_by: string | null
          changes: Json | null
          created_at: string
          id: string
          invoice_id: string
          note: string | null
          revision_number: number
          snapshot: Json | null
        }
        Insert: {
          action?: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          invoice_id: string
          note?: string | null
          revision_number?: number
          snapshot?: Json | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string | null
          revision_number?: number
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_revisions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_transports: {
        Row: {
          cost: number | null
          created_at: string
          destination_id: string | null
          driver_name: string | null
          id: string
          invoice_id: string
          notes: string | null
          transport_date: string
          transporter_id: string | null
          vehicle_number: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          destination_id?: string | null
          driver_name?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          transport_date?: string
          transporter_id?: string | null
          vehicle_number?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          destination_id?: string | null
          driver_name?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          transport_date?: string
          transporter_id?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_transports_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_transports_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_transports_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_uid: string | null
          currency_code: string | null
          customer_id: string | null
          date: string
          delivery_note_number: string | null
          discount: number | null
          due_amount: number | null
          due_date: string | null
          exchange_rate: number | null
          exchange_rate_to_base: number | null
          id: string
          internal_note: string | null
          invoice_number: string
          is_proforma: boolean | null
          notes: string | null
          paid_amount: number | null
          parent_invoice_id: string | null
          payment_method: string | null
          shipping: number | null
          status: string | null
          stock_deducted_at: string | null
          stock_deduction_id: string | null
          subtotal: number | null
          tax_status: string | null
          tid: number | null
          total: number | null
          type: string | null
          updated_at: string
          updated_by: string | null
          user_note: string | null
          workflow_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_uid?: string | null
          currency_code?: string | null
          customer_id?: string | null
          date?: string
          delivery_note_number?: string | null
          discount?: number | null
          due_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_to_base?: number | null
          id?: string
          internal_note?: string | null
          invoice_number: string
          is_proforma?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          parent_invoice_id?: string | null
          payment_method?: string | null
          shipping?: number | null
          status?: string | null
          stock_deducted_at?: string | null
          stock_deduction_id?: string | null
          subtotal?: number | null
          tax_status?: string | null
          tid?: number | null
          total?: number | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          workflow_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_uid?: string | null
          currency_code?: string | null
          customer_id?: string | null
          date?: string
          delivery_note_number?: string | null
          discount?: number | null
          due_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_to_base?: number | null
          id?: string
          internal_note?: string | null
          invoice_number?: string
          is_proforma?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          parent_invoice_id?: string | null
          payment_method?: string | null
          shipping?: number | null
          status?: string | null
          stock_deducted_at?: string | null
          stock_deduction_id?: string | null
          subtotal?: number | null
          tax_status?: string | null
          tid?: number | null
          total?: number | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_packaging_items: {
        Row: {
          created_at: string
          id: string
          invoice_packaging_id: string
          notes: string | null
          packaging_type_id: string | null
          packs_count: number
          pieces_per_pack: number
          price: number | null
          product_id: string | null
          product_name: string | null
          quantity: number
          total: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_packaging_id: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          total?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          invoice_packaging_id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_packaging_items_invoice_packaging_id_fkey"
            columns: ["invoice_packaging_id"]
            isOneToOne: false
            referencedRelation: "invoice_packaging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_packaging_items_packaging_type_id_fkey"
            columns: ["packaging_type_id"]
            isOneToOne: false
            referencedRelation: "packaging_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_packaging_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_transports_items: {
        Row: {
          created_at: string
          id: string
          invoice_transport_id: string
          notes: string | null
          packs_count: number
          pieces_per_pack: number
          price: number | null
          product_id: string | null
          product_name: string | null
          quantity: number
          total: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_transport_id: string
          notes?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          total?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          invoice_transport_id?: string
          notes?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_transports_items_invoice_transport_id_fkey"
            columns: ["invoice_transport_id"]
            isOneToOne: false
            referencedRelation: "invoice_transports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transports_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          city_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "localities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      locality_transporters: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          locality_id: string
          transporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          locality_id: string
          transporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          locality_id?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locality_transporters_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      product_brand_links: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          product_id?: string
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
      product_category_links: {
        Row: {
          category_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_links_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
          foreign_price: number | null
          id: string
          image_url: string | null
          is_frozen: boolean
          min_stock: number | null
          name: string
          purchase_price: number | null
          sale_price: number | null
          sku: string | null
          stock_quantity: number | null
          supplier_id: string | null
          unit: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          foreign_price?: number | null
          id?: string
          image_url?: string | null
          is_frozen?: boolean
          min_stock?: number | null
          name: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          foreign_price?: number | null
          id?: string
          image_url?: string | null
          is_frozen?: boolean
          min_stock?: number | null
          name?: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
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
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      purchase_attachments: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          expires_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          purchase_order_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          purchase_order_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          purchase_order_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          category_id: string | null
          created_at: string
          discount: number | null
          discount_value: number | null
          foreign_price: number | null
          format_discount: string | null
          id: string
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity?: number
          total: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          total?: number
          unit?: string | null
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
          created_by: string | null
          currency_code: string | null
          date: string
          discount: number | null
          exchange_rate_to_base: number | null
          expected_delivery_date: string | null
          id: string
          internal_note: string | null
          notes: string | null
          order_number: string
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          supplier_invoice_number: string | null
          total: number | null
          updated_at: string
          updated_by: string | null
          user_note: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          date?: string
          discount?: number | null
          exchange_rate_to_base?: number | null
          expected_delivery_date?: string | null
          id?: string
          internal_note?: string | null
          notes?: string | null
          order_number: string
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total?: number | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          date?: string
          discount?: number | null
          exchange_rate_to_base?: number | null
          expected_delivery_date?: string | null
          id?: string
          internal_note?: string | null
          notes?: string | null
          order_number?: string
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total?: number | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          warehouse_id?: string | null
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
      quote_attachments: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          expires_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          quote_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          quote_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          quote_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          category_id: string | null
          created_at: string
          discount: number | null
          discount_value: number | null
          foreign_price: number | null
          format_discount: string | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          quote_id: string
          tax_status: string | null
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          quote_id: string
          tax_status?: string | null
          total: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          discount?: number | null
          discount_value?: number | null
          foreign_price?: number | null
          format_discount?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          quote_id?: string
          tax_status?: string | null
          total?: number
          unit?: string | null
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
      quote_ownership_transfers: {
        Row: {
          created_at: string
          from_user_id: string | null
          from_user_name: string | null
          id: string
          note: string | null
          quote_id: string
          to_user_id: string
          to_user_name: string | null
          transferred_by: string
          transferred_by_name: string | null
        }
        Insert: {
          created_at?: string
          from_user_id?: string | null
          from_user_name?: string | null
          id?: string
          note?: string | null
          quote_id: string
          to_user_id: string
          to_user_name?: string | null
          transferred_by: string
          transferred_by_name?: string | null
        }
        Update: {
          created_at?: string
          from_user_id?: string | null
          from_user_name?: string | null
          id?: string
          note?: string | null
          quote_id?: string
          to_user_id?: string
          to_user_name?: string | null
          transferred_by?: string
          transferred_by_name?: string | null
        }
        Relationships: []
      }
      quote_transports: {
        Row: {
          cost: number | null
          created_at: string
          customer_id: string | null
          destination_id: string | null
          driver_name: string | null
          id: string
          notes: string | null
          quote_id: string
          transport_date: string
          transporter_id: string | null
          vehicle_number: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          destination_id?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          quote_id: string
          transport_date?: string
          transporter_id?: string | null
          vehicle_number?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          destination_id?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          quote_id?: string
          transport_date?: string
          transporter_id?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_transports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_transports_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_transports_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_transports_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          converted_at: string | null
          converted_by: string | null
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          created_by_uid: string | null
          currency_code: string | null
          customer_id: string | null
          date: string
          discount: number | null
          exchange_rate_to_base: number | null
          id: string
          internal_note: string | null
          is_side: boolean
          notes: string | null
          quote_number: string
          status: string | null
          subtotal: number | null
          tax_status: string | null
          tid: number | null
          total: number | null
          updated_at: string
          updated_by: string | null
          user_note: string | null
          valid_until: string | null
          warehouse_id: string | null
        }
        Insert: {
          converted_at?: string | null
          converted_by?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_uid?: string | null
          currency_code?: string | null
          customer_id?: string | null
          date?: string
          discount?: number | null
          exchange_rate_to_base?: number | null
          id?: string
          internal_note?: string | null
          is_side?: boolean
          notes?: string | null
          quote_number: string
          status?: string | null
          subtotal?: number | null
          tax_status?: string | null
          tid?: number | null
          total?: number | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Update: {
          converted_at?: string | null
          converted_by?: string | null
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_uid?: string | null
          currency_code?: string | null
          customer_id?: string | null
          date?: string
          discount?: number | null
          exchange_rate_to_base?: number | null
          id?: string
          internal_note?: string | null
          is_side?: boolean
          notes?: string | null
          quote_number?: string
          status?: string | null
          subtotal?: number | null
          tax_status?: string | null
          tid?: number | null
          total?: number | null
          updated_at?: string
          updated_by?: string | null
          user_note?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes_packaging: {
        Row: {
          cost: number | null
          created_at: string
          dimensions: string | null
          id: string
          notes: string | null
          packaging_type_id: string | null
          packs_count: number
          pieces_per_pack: number
          quantity: number
          quote_id: string
          weight: number | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          quantity?: number
          quote_id: string
          weight?: number | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          quantity?: number
          quote_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_packaging_packaging_type_id_fkey"
            columns: ["packaging_type_id"]
            isOneToOne: false
            referencedRelation: "packaging_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_packaging_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes_packaging_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          packaging_type_id: string | null
          packs_count: number
          pieces_per_pack: number
          price: number | null
          product_id: string | null
          product_name: string | null
          quantity: number
          quote_packaging_id: string
          total: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quote_packaging_id: string
          total?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          packaging_type_id?: string | null
          packs_count?: number
          pieces_per_pack?: number
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quote_packaging_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_packaging_items_packaging_type_id_fkey"
            columns: ["packaging_type_id"]
            isOneToOne: false
            referencedRelation: "packaging_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_packaging_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_packaging_items_quote_packaging_id_fkey"
            columns: ["quote_packaging_id"]
            isOneToOne: false
            referencedRelation: "quotes_packaging"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      states: {
        Row: {
          created_at: string
          id: string
          name: string
          region_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          region_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          region_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "states_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      transaction_categories: {
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
      user_roles: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ui_preferences: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
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
      advance_invoice_workflow: {
        Args: { _invoice_id: string; _reason: string; _target: string }
        Returns: undefined
      }
      current_user_login_status: { Args: never; Returns: string }
      current_user_permissions: { Args: never; Returns: Json }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_invoice_items_silent: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      delete_quote_items_silent: {
        Args: { p_quote_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_duplicate_invoice: {
        Args: {
          _customer_id: string
          _date: string
          _exclude_invoice_id?: string
          _items: Json
        }
        Returns: {
          id: string
          invoice_number: string
        }[]
      }
      get_cloud_usage_stats: { Args: never; Returns: Json }
      get_customer_balance_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoice_items_hash: { Args: { _invoice_id: string }; Returns: string }
      is_login_allowed: { Args: { _user_id: string }; Returns: boolean }
      is_workflow_automation_enabled: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_all_customer_balances: { Args: never; Returns: Json }
      recalc_customer_balance: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      workflow_rank: { Args: { _s: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "sales" | "viewer"
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
    Enums: {
      app_role: ["admin", "sales", "viewer"],
    },
  },
} as const
