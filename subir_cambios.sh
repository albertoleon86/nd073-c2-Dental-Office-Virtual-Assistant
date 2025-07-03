#!/bin/bash

echo "📦 Estado actual del repositorio:"
git status

echo "➕ Añadiendo todos los archivos modificados..."
git add .

echo "📝 Escribe el mensaje del commit:"
read mensaje

git commit -m "$mensaje"

echo "🚀 Subiendo los cambios a tu repositorio en GitHub..."
git push origin master

echo "✅ Cambios subidos correctamente."
