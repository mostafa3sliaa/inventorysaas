export const logActivity = async (
  supabase: any,
  tenantId: string,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: any
) => {
  console.log("logActivity called with:", { tenantId, userId, action });
  if (!tenantId || !userId) {
    console.warn("Skipping logActivity because tenantId or userId is missing");
    alert("تحذير: تعذر تسجيل النشاط لأن بيانات المستخدم مفقودة (userId is undefined).");
    return;
  }

  try {
    const { error } = await supabase.from("activity_logs").insert([{
      tenant_id: tenantId,
      user_id: userId,
      action_type: action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || null
    }]);
    if (error) {
      console.error("Supabase insert error in logActivity:", error);
      alert("Error logging activity: " + error.message);
    }
  } catch (error: any) {
    console.error("Failed to log activity:", error);
    alert("Exception logging activity: " + error.message);
  }
};
