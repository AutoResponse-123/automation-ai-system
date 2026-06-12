-- Optimización de performance de RLS + limpieza de índices.
-- Aplicada vía Supabase MCP el 2026-06-12. Este archivo queda para paridad/documentación.
--
-- Qué resuelve (advisors de Supabase):
--   1) auth_rls_initplan (22): envolver auth.uid() en (select auth.uid()) para que se
--      evalúe una sola vez por query en vez de una vez por fila.
--   2) multiple_permissive_policies (30): políticas permisivas solapadas para SELECT.
--      - conversations/messages/escalations: la policy *_select era redundante con la *_modify
--        (FOR ALL, misma condición) -> se elimina la *_select.
--      - profiles/ingredients/recipe_steps: se separa la policy "manage" (FOR ALL) en
--        INSERT/UPDATE/DELETE para no solapar el SELECT (que es más amplio: view-all / públicas).
--   3) duplicate_index (4): se eliminan índices idénticos duplicados.
-- Sin cambios de semántica de acceso.

-- ===== RLS: envolver auth.uid() + consolidar =====

-- admin_events
DROP POLICY "admin_events_insert" ON public.admin_events;
CREATE POLICY "admin_events_insert" ON public.admin_events FOR INSERT
  WITH CHECK ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());
DROP POLICY "admin_events_select" ON public.admin_events;
CREATE POLICY "admin_events_select" ON public.admin_events FOR SELECT
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());

-- appointments
DROP POLICY "appointments_owner" ON public.appointments;
CREATE POLICY "appointments_owner" ON public.appointments FOR ALL
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());

-- businesses (solo insert seguía sin envolver)
DROP POLICY "businesses_insert" ON public.businesses;
CREATE POLICY "businesses_insert" ON public.businesses FOR INSERT
  WITH CHECK ((user_id = (SELECT auth.uid())) OR is_admin());

-- chat_messages
DROP POLICY "Users can insert their own chat messages" ON public.chat_messages;
CREATE POLICY "Users can insert their own chat messages" ON public.chat_messages FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY "Users can view their own chat messages" ON public.chat_messages;
CREATE POLICY "Users can view their own chat messages" ON public.chat_messages FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- contacts (delete + update)
DROP POLICY "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());
DROP POLICY "contacts_update" ON public.contacts;
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());

-- conversation_notes
DROP POLICY "notes_owner" ON public.conversation_notes;
CREATE POLICY "notes_owner" ON public.conversation_notes FOR ALL
  USING ((conversation_id IN (SELECT c.id FROM conversations c JOIN businesses b ON b.id = c.business_id WHERE b.user_id = (SELECT auth.uid()))) OR is_admin());

-- conversations: *_select era redundante con *_modify (ALL) -> eliminar
DROP POLICY "conversations_select" ON public.conversations;
DROP POLICY "conversations_modify" ON public.conversations;
CREATE POLICY "conversations_modify" ON public.conversations FOR ALL
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());

-- escalations: idem
DROP POLICY "escalations_select" ON public.escalations;
DROP POLICY "escalations_modify" ON public.escalations;
CREATE POLICY "escalations_modify" ON public.escalations FOR ALL
  USING ((business_id IN (SELECT businesses.id FROM businesses WHERE businesses.user_id = (SELECT auth.uid()))) OR is_admin());

-- messages: idem
DROP POLICY "messages_select" ON public.messages;
DROP POLICY "messages_modify" ON public.messages;
CREATE POLICY "messages_modify" ON public.messages FOR ALL
  USING ((conversation_id IN (SELECT c.id FROM conversations c JOIN businesses b ON b.id = c.business_id WHERE b.user_id = (SELECT auth.uid()))) OR is_admin());

-- profiles: separar manage (ALL) en ins/upd/del; mantener SELECT view-all
DROP POLICY "Users can manage their own profile" ON public.profiles;
DROP POLICY "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING ((SELECT auth.uid()) = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING ((SELECT auth.uid()) = id);

-- recipes (4 policies, solo envolver)
DROP POLICY "Users can delete their own recipes" ON public.recipes;
CREATE POLICY "Users can delete their own recipes" ON public.recipes FOR DELETE USING ((SELECT auth.uid()) = user_id);
DROP POLICY "Users can insert their own recipes" ON public.recipes;
CREATE POLICY "Users can insert their own recipes" ON public.recipes FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY "Users can view their own recipes" ON public.recipes;
CREATE POLICY "Users can view their own recipes" ON public.recipes FOR SELECT USING (((SELECT auth.uid()) = user_id) OR (is_public = true));
DROP POLICY "Users can update their own recipes" ON public.recipes;
CREATE POLICY "Users can update their own recipes" ON public.recipes FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- ingredients: separar manage + select más amplio (incluye públicas)
DROP POLICY "Users can manage ingredients of their recipes" ON public.ingredients;
DROP POLICY "Users can view ingredients of accessible recipes" ON public.ingredients;
CREATE POLICY "ingredients_select" ON public.ingredients FOR SELECT
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = ingredients.recipe_id AND ((recipes.user_id = (SELECT auth.uid())) OR (recipes.is_public = true))));
CREATE POLICY "ingredients_insert" ON public.ingredients FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = ingredients.recipe_id AND recipes.user_id = (SELECT auth.uid())));
CREATE POLICY "ingredients_update" ON public.ingredients FOR UPDATE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = ingredients.recipe_id AND recipes.user_id = (SELECT auth.uid())));
CREATE POLICY "ingredients_delete" ON public.ingredients FOR DELETE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = ingredients.recipe_id AND recipes.user_id = (SELECT auth.uid())));

-- recipe_steps: idem ingredients
DROP POLICY "Users can manage steps of their recipes" ON public.recipe_steps;
DROP POLICY "Users can view steps of accessible recipes" ON public.recipe_steps;
CREATE POLICY "recipe_steps_select" ON public.recipe_steps FOR SELECT
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_steps.recipe_id AND ((recipes.user_id = (SELECT auth.uid())) OR (recipes.is_public = true))));
CREATE POLICY "recipe_steps_insert" ON public.recipe_steps FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_steps.recipe_id AND recipes.user_id = (SELECT auth.uid())));
CREATE POLICY "recipe_steps_update" ON public.recipe_steps FOR UPDATE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_steps.recipe_id AND recipes.user_id = (SELECT auth.uid())));
CREATE POLICY "recipe_steps_delete" ON public.recipe_steps FOR DELETE
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_steps.recipe_id AND recipes.user_id = (SELECT auth.uid())));

-- shopping_lists (policy única ALL, solo envolver)
DROP POLICY "Users can manage their own shopping lists" ON public.shopping_lists;
CREATE POLICY "Users can manage their own shopping lists" ON public.shopping_lists FOR ALL
  USING ((SELECT auth.uid()) = user_id);

-- ===== Índices duplicados =====
DROP INDEX IF EXISTS public.idx_appointments_business;     -- queda idx_appointments_business_id
DROP INDEX IF EXISTS public.idx_conversations_business;     -- queda idx_conversations_business_id
DROP INDEX IF EXISTS public.idx_messages_conversation;      -- queda idx_messages_conversation_id
DROP INDEX IF EXISTS public.idx_messages_created;           -- queda idx_messages_created_at
