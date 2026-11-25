import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { Recipe, RecipeIngredient, ProductItem } from '../../types';
import { formatCRC } from '../../utils/formatters';
import {
  ChefHat,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
  Edit3,
  Tag,
  X,
  Save,
} from 'lucide-react';

export const RecipesView: React.FC = () => {
  const { products, categories, inventory, recipes, toggleRecipeAutoDeduct, saveRecipe, saveProduct } = usePOS();
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'recipes' | 'catalog'>('recipes');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Recipe Modal State
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Product Modal State
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            La formulación de recetas, costos unitarios y márgenes brutos está protegida y es de uso exclusivo para Administradores.
          </p>
        </div>
      </div>
    );
  }

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner(prev => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const toggleAutoDeduct = async (recipeId: string) => {
    try {
      await toggleRecipeAutoDeduct(recipeId);
      showBanner('success', 'Estado de descuento automático actualizado.');
    } catch (err: any) {
      showBanner('error', err?.message || 'Error al cambiar el descuento automático.');
    }
  };

  const handleOpenEditRecipe = (recipe: Recipe) => {
    // Refresh unitCost from current inventory averageCost/lastPurchaseCost
    const refreshedIngredients = recipe.ingredients.map(ing => {
      const invItem = inventory.find(i => i.id === ing.itemId);
      return {
        ...ing,
        itemName: invItem?.name || ing.itemName,
        unit: invItem?.unit || ing.unit,
        unitCost: invItem ? (invItem.averageCost || invItem.lastPurchaseCost || ing.unitCost || 0) : (ing.unitCost || 0),
      };
    });
    setEditingRecipe({
      ...recipe,
      ingredients: refreshedIngredients,
    });
  };

  const handleOpenNewRecipe = () => {
    const defaultProduct = products[0];
    setEditingRecipe({
      id: `rec_${Date.now()}`,
      productId: defaultProduct?.id || '',
      productName: defaultProduct?.name || 'Nuevo Platillo',
      ingredients: [],
      yieldPortions: 1,
      isComplete: false,
      calculatedCost: 0,
      autoDeductEnabled: false,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddRecipeIngredient = () => {
    if (!editingRecipe || inventory.length === 0) return;
    const firstInv = inventory[0];
    const newIng: RecipeIngredient = {
      itemId: firstInv.id,
      itemName: firstInv.name,
      quantity: 0.1,
      unit: firstInv.unit,
      unitCost: firstInv.averageCost || firstInv.lastPurchaseCost || 0,
    };
    setEditingRecipe({
      ...editingRecipe,
      ingredients: [...editingRecipe.ingredients, newIng],
    });
  };

  const handleUpdateRecipeIngredient = (idx: number, field: 'itemId' | 'quantity', val: any) => {
    if (!editingRecipe) return;
    const updated = editingRecipe.ingredients.map((ing, i) => {
      if (i !== idx) return ing;
      if (field === 'itemId') {
        const inv = inventory.find(item => item.id === val);
        if (!inv) return ing;
        return {
          ...ing,
          itemId: inv.id,
          itemName: inv.name,
          unit: inv.unit,
          unitCost: inv.averageCost || inv.lastPurchaseCost || 0,
        };
      }
      return {
        ...ing,
        quantity: Math.max(0, Number(val) || 0),
      };
    });
    setEditingRecipe({
      ...editingRecipe,
      ingredients: updated,
    });
  };

  const handleRemoveRecipeIngredient = (idx: number) => {
    if (!editingRecipe) return;
    setEditingRecipe({
      ...editingRecipe,
      ingredients: editingRecipe.ingredients.filter((_, i) => i !== idx),
    });
  };

  const handleSaveRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipe) return;

    const validIngredients = editingRecipe.ingredients.filter(ing => ing.quantity > 0);
    const yieldPortions = Math.max(1, Number(editingRecipe.yieldPortions) || 1);
    const batchCost = validIngredients.reduce((sum, ing) => sum + ing.quantity * (ing.unitCost || 0), 0);
    const totalCost = Math.round(batchCost / yieldPortions);
    const isComplete = validIngredients.length > 0 && totalCost > 0;

    const finalRecipe: Recipe = {
      ...editingRecipe,
      yieldPortions,
      ingredients: validIngredients,
      calculatedCost: totalCost,
      isComplete,
      autoDeductEnabled: isComplete ? editingRecipe.autoDeductEnabled : false,
      updatedAt: new Date().toISOString(),
    };

    setIsSavingRecipe(true);
    try {
      await saveRecipe(finalRecipe);
      setEditingRecipe(null);
      showBanner('success', `Receta "${finalRecipe.productName}" guardada correctamente.`);
    } catch (err: any) {
      showBanner('error', err?.message || 'Error al guardar la receta.');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleOpenNewProduct = () => {
    setEditingProduct({
      id: `prod_${Date.now()}`,
      categoryId: categories[0]?.id || 'cat-casados',
      name: '',
      description: '',
      price: 2500,
      available: true,
      active: true,
      isCasado: false,
    });
  };

  const handleSaveProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name.trim()) return;

    setIsSavingProduct(true);
    try {
      await saveProduct({
        ...editingProduct,
        available: editingProduct.active,
      });
      setEditingProduct(null);
      showBanner('success', `Producto "${editingProduct.name}" actualizado en el menú.`);
    } catch (err: any) {
      showBanner('error', err?.message || 'Error al guardar el producto.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Estructura de Costeo Real & Carta
              </span>
              <span className="text-xs text-gray-500 font-medium">Administración</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Recetas, Precios de Carta y Costos</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure ingredientes dosificados por platillo y ajuste precios o disponibilidad del menú en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200">
              <button
                type="button"
                onClick={() => setActiveTab('recipes')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'recipes'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <ChefHat className="w-4 h-4" />
                <span>Recetas ({recipes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'catalog'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <Tag className="w-4 h-4" />
                <span>Menú y Precios ({products.length})</span>
              </button>
            </div>

            {activeTab === 'recipes' ? (
              <button
                type="button"
                onClick={handleOpenNewRecipe}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-xs shadow-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Receta</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenNewProduct}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-xs shadow-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Platillo</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Status Banner */}
        {banner && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button onClick={() => setBanner(null)} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'recipes' ? (
          /* Recipes Grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recipes.map(recipe => {
              const product = products.find(p => p.id === recipe.productId);
              const salePrice = product?.price || 0;
              const cost = recipe.calculatedCost;
              const hasCompleteData = recipe.isComplete && cost !== undefined && cost > 0;
              const margin = hasCompleteData && salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : 0;

              return (
                <div
                  key={recipe.id}
                  className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-500">
                            {recipe.protein ? `Proteína: ${recipe.protein}` : 'Platillo estándar'}
                          </span>
                          {recipe.autoDeductEnabled && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                              Descuento Automático Activo
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-lg text-gray-900 mt-1">{recipe.productName}</h3>
                        <div className="text-xs font-bold text-gray-700">
                          Precio Venta Carta: {formatCRC(salePrice)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                            hasCompleteData
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {hasCompleteData ? 'Receta Validada' : 'Pendiente de configurar'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditRecipe(recipe)}
                          className="p-2 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 transition"
                          title="Editar ingredientes y cantidades de la receta"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Cost & Margin Calculation */}
                    <div className="grid grid-cols-2 gap-3 mt-4 p-3 bg-gray-50 rounded-2xl border border-gray-100 text-xs">
                      <div>
                        <span className="text-gray-500 text-[11px]">Costo Calculado por Porción:</span>
                        <div className="text-base font-black text-gray-900">
                          {hasCompleteData ? formatCRC(cost) : 'Pendiente de configurar'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[11px]">Margen Bruto Real:</span>
                        <div className="text-base font-black text-emerald-600">
                          {hasCompleteData ? `${margin.toFixed(1)}%` : 'Pendiente de configurar'}
                        </div>
                      </div>
                    </div>

                    {/* Ingredients Breakdown */}
                    <div className="mt-4 space-y-1 text-xs">
                      <span className="font-bold text-gray-700 text-[11px] uppercase tracking-wider">
                        Ingredientes Dosificados:
                      </span>
                      {recipe.ingredients.length === 0 ? (
                        <p className="text-xs text-amber-700 italic bg-amber-50 p-2 rounded-xl border border-amber-200 mt-1">
                          Esta receta no tiene ingredientes configurados aún. Pulse el botón Editar para agregar insumos.
                        </p>
                      ) : (
                        <div className="divide-y divide-gray-100 mt-1">
                          {recipe.ingredients.map((ing, idx) => (
                            <div key={idx} className="py-1.5 flex justify-between text-gray-700">
                              <span>
                                {ing.quantity} {ing.unit} de {ing.itemName}
                              </span>
                              <span className="font-semibold text-gray-900">
                                {ing.unitCost ? formatCRC(Math.round(ing.quantity * ing.unitCost)) : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Switch */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`autoDeduct-${recipe.id}`}
                        checked={recipe.autoDeductEnabled}
                        disabled={!recipe.isComplete}
                        onChange={() => toggleAutoDeduct(recipe.id)}
                        className="w-4 h-4 text-red-600 rounded border-gray-300"
                      />
                      <label
                        htmlFor={`autoDeduct-${recipe.id}`}
                        className={`font-semibold cursor-pointer ${
                          !recipe.isComplete ? 'text-gray-400' : 'text-gray-800'
                        }`}
                      >
                        Descontar inventario al vender
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEditRecipe(recipe)}
                      className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Configurar Insumos</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Menu Products & Prices Catalog */
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg text-gray-900">Catálogo de Productos y Precios de Venta</h3>
                <p className="text-xs text-gray-500">
                  Edite el precio en colones, nombre o disponibilidad de cualquier platillo del Punto de Venta.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Platillo / Producto</th>
                    <th className="py-2.5 px-3">Categoría</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Precio Carta</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(prod => {
                    const cat = categories.find(c => c.id === prod.categoryId);
                    return (
                      <tr key={prod.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          {prod.name}
                          {prod.description && (
                            <div className="text-[11px] text-gray-400 font-normal">{prod.description}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 font-semibold">{cat?.name || prod.categoryId}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-700">
                            {prod.isCasado ? 'Casado (Con Proteína)' : 'Estándar'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-black text-sm text-red-600">{formatCRC(prod.price)}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              prod.active
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {prod.active ? 'Disponible en POS' : 'Oculto'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingProduct({ ...prod })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 font-bold text-xs transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar Precio / Datos</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Edit / Create Recipe */}
      {editingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveRecipeSubmit}
            className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                  Formulación de Receta
                </span>
                <h3 className="font-black text-lg text-gray-900 mt-1">{editingRecipe.productName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecipe(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Producto Vinculado del Menú</label>
                <select
                  value={editingRecipe.productId}
                  onChange={e => {
                    const prod = products.find(p => p.id === e.target.value);
                    setEditingRecipe({
                      ...editingRecipe,
                      productId: e.target.value,
                      productName: prod
                        ? `${prod.name}${editingRecipe.protein ? ` (${editingRecipe.protein})` : ''}`
                        : editingRecipe.productName,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white font-semibold"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCRC(p.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Descriptivo de Receta</label>
                <input
                  type="text"
                  required
                  value={editingRecipe.productName}
                  onChange={e => setEditingRecipe({ ...editingRecipe, productName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 font-semibold"
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Rendimiento (Porciones por Lote)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={editingRecipe.yieldPortions || 1}
                    onChange={e =>
                      setEditingRecipe({
                        ...editingRecipe,
                        yieldPortions: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 font-bold"
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-[11px] text-gray-500 leading-tight">
                    Si la receta es para 1 plato deje <strong>1</strong>. Si es para una olla de 20 porciones indique <strong>20</strong>; el descuento y costo por porción se dividirán automáticamente.
                  </p>
                </div>
              </div>
            </div>

            {/* Ingredients List */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Insumos por Porción
                </label>
                <button
                  type="button"
                  onClick={handleAddRecipeIngredient}
                  className="flex items-center gap-1 text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-xl transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Insumo</span>
                </button>
              </div>

              {editingRecipe.ingredients.length === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-center">
                  No hay insumos en esta receta. Pulse "Agregar Insumo" para dosificar los ingredientes.
                </div>
              ) : (
                <div className="space-y-2">
                  {editingRecipe.ingredients.map((ing, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2.5 rounded-2xl border border-gray-200 text-xs"
                    >
                      <div className="col-span-6">
                        <select
                          value={ing.itemId}
                          onChange={e => handleUpdateRecipeIngredient(idx, 'itemId', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-semibold"
                        >
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} ({inv.unit} — {formatCRC(inv.averageCost || inv.lastPurchaseCost || 0)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="any"
                            min={0.001}
                            required
                            value={ing.quantity}
                            onChange={e => handleUpdateRecipeIngredient(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-center"
                          />
                          <span className="text-[10px] text-gray-500 font-bold">{ing.unit}</span>
                        </div>
                      </div>

                      <div className="col-span-2 text-right font-bold text-gray-800">
                        {formatCRC(Math.round(ing.quantity * (ing.unitCost || 0)))}
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipeIngredient(idx)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-gray-700 block">
                  Costo Total Estimado por Porción (÷ {Math.max(1, editingRecipe.yieldPortions || 1)}):
                </span>
                <span className="text-[11px] text-gray-500">
                  Lote total:{' '}
                  {formatCRC(
                    Math.round(
                      editingRecipe.ingredients.reduce(
                        (sum, ing) => sum + (Number(ing.quantity) || 0) * (Number(ing.unitCost) || 0),
                        0
                      )
                    )
                  )}
                </span>
              </div>
              <span className="text-base font-black text-red-600">
                {formatCRC(
                  Math.round(
                    editingRecipe.ingredients.reduce(
                      (sum, ing) => sum + (Number(ing.quantity) || 0) * (Number(ing.unitCost) || 0),
                      0
                    ) / Math.max(1, Number(editingRecipe.yieldPortions) || 1)
                  )
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRecipe(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingRecipe}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingRecipe ? 'Guardando...' : 'Guardar Receta'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit / Create Product */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveProductSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-black text-lg text-gray-900">Configurar Platillo / Precio</h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Nombre del Producto</label>
              <input
                type="text"
                required
                value={editingProduct.name}
                onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                placeholder="Ej. Casado con Pollo, Porción de Papas..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-bold text-gray-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Categoría</label>
                <select
                  value={editingProduct.categoryId}
                  onChange={e => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white font-semibold"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Precio Venta (CRC ₡)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={editingProduct.price}
                  onChange={e => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 font-black text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Descripción (Opcional)</label>
              <input
                type="text"
                value={editingProduct.description || ''}
                onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                placeholder="Detalle breve del platillo..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={editingProduct.active}
                  onChange={e => setEditingProduct({ ...editingProduct, active: e.target.checked })}
                  className="w-4 h-4 text-red-600 rounded border-gray-300"
                />
                <span>Disponible en Punto de Venta</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(editingProduct.isCasado)}
                  onChange={e => setEditingProduct({ ...editingProduct, isCasado: e.target.checked })}
                  className="w-4 h-4 text-red-600 rounded border-gray-300"
                />
                <span>Requiere proteína (Casado)</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingProduct}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md"
              >
                {isSavingProduct ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
