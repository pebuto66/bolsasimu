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
      equity_snapshots: {
        Row: {
          created_at: string
          device_id: string
          id: string
          value_eur: number
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          value_eur: number
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          value_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "equity_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["device_id"]
          },
        ]
      }
      portfolios: {
        Row: {
          cash_eur: number
          created_at: string
          device_id: string
          finnhub_key: string | null
        }
        Insert: {
          cash_eur?: number
          created_at?: string
          device_id: string
          finnhub_key?: string | null
        }
        Update: {
          cash_eur?: number
          created_at?: string
          device_id?: string
          finnhub_key?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_price: number
          cost_eur: number
          currency: string
          device_id: string
          id: string
          last_price: number | null
          last_price_at: string | null
          name: string
          quantity: number
          symbol: string
          type: string
        }
        Insert: {
          avg_price: number
          cost_eur: number
          currency?: string
          device_id: string
          id?: string
          last_price?: number | null
          last_price_at?: string | null
          name: string
          quantity: number
          symbol: string
          type?: string
        }
        Update: {
          avg_price?: number
          cost_eur?: number
          currency?: string
          device_id?: string
          id?: string
          last_price?: number | null
          last_price_at?: string | null
          name?: string
          quantity?: number
          symbol?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["device_id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          currency: string
          device_id: string
          id: string
          name: string
          price: number
          quantity: number
          side: string
          symbol: string
          total_eur: number
        }
        Insert: {
          created_at?: string
          currency: string
          device_id: string
          id?: string
          name: string
          price: number
          quantity: number
          side: string
          symbol: string
          total_eur: number
        }
        Update: {
          created_at?: string
          currency?: string
          device_id?: string
          id?: string
          name?: string
          price?: number
          quantity?: number
          side?: string
          symbol?: string
          total_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["device_id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          id: string
          name: string
          symbol: string
          type: string
          watchlist_id: string
        }
        Insert: {
          id?: string
          name: string
          symbol: string
          type?: string
          watchlist_id: string
        }
        Update: {
          id?: string
          name?: string
          symbol?: string
          type?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          device_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["device_id"]
          },
        ]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
