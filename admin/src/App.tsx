import { Refine } from '@refinedev/core';
import { ThemedLayoutV2, useNotificationProvider } from '@refinedev/antd';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { dataProvider } from './providers/dataProvider';
import { authProvider } from './providers/authProvider';

import { Login } from './pages/login';
import { RecipeList } from './pages/recipes/list';
import { RecipeShow } from './pages/recipes/show';
import { RecipeCreate } from './pages/recipes/create';
import { RecipeEdit } from './pages/recipes/edit';
import { CategoryList } from './pages/categories/list';
import { CategoryCreate } from './pages/categories/create';
import { CategoryEdit } from './pages/categories/edit';
import { UserList } from './pages/users/list';
import { UserEdit } from './pages/users/edit';
import { FavoriteList } from './pages/favorites/list';
import { FeatureFlagList } from './pages/feature-flags/list';

function AdminLayout() {
  return (
    <ThemedLayoutV2>
      <Outlet />
    </ThemedLayoutV2>
  );
}

export function App() {
  return (
    <AntdApp>
      <BrowserRouter>
        <Refine
          dataProvider={dataProvider as any}
          authProvider={authProvider}
          notificationProvider={useNotificationProvider}
          resources={[
            {
              name: 'recipes',
              list: '/admin/recipes',
              show: '/admin/recipes/show/:id',
              create: '/admin/recipes/create',
              edit: '/admin/recipes/edit/:id',
              meta: { label: 'Recipes' },
            },
            {
              name: 'categories',
              list: '/admin/categories',
              create: '/admin/categories/create',
              edit: '/admin/categories/edit/:id',
              meta: { label: 'Categories' },
            },
            {
              name: 'users',
              list: '/admin/users',
              edit: '/admin/users/edit/:id',
              meta: { label: 'Users' },
            },
            {
              name: 'favorites',
              list: '/admin/favorites',
              meta: { label: 'Favorites' },
            },
            {
              name: 'feature-flags',
              list: '/admin/feature-flags',
              meta: { label: 'Feature Flags' },
            },
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
        >
          <Routes>
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/recipes" />} />
              <Route path="recipes">
                <Route index element={<RecipeList />} />
                <Route path="show/:id" element={<RecipeShow />} />
                <Route path="create" element={<RecipeCreate />} />
                <Route path="edit/:id" element={<RecipeEdit />} />
              </Route>
              <Route path="categories">
                <Route index element={<CategoryList />} />
                <Route path="create" element={<CategoryCreate />} />
                <Route path="edit/:id" element={<CategoryEdit />} />
              </Route>
              <Route path="users">
                <Route index element={<UserList />} />
                <Route path="edit/:id" element={<UserEdit />} />
              </Route>
              <Route path="favorites">
                <Route index element={<FavoriteList />} />
              </Route>
              <Route path="feature-flags">
                <Route index element={<FeatureFlagList />} />
              </Route>
            </Route>
          </Routes>
        </Refine>
      </BrowserRouter>
    </AntdApp>
  );
}
