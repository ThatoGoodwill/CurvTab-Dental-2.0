# ---------- Build ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution + all project files first (so restore is cached)
COPY backend/CurvTabDental.API/CurvTabDental.API.csproj              backend/CurvTabDental.API/
COPY backend/CurvTabDental.Application/CurvTabDental.Application.csproj backend/CurvTabDental.Application/
COPY backend/CurvTabDental.Domain/CurvTabDental.Domain.csproj        backend/CurvTabDental.Domain/
COPY backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj backend/CurvTabDental.Infrastructure/

RUN dotnet restore backend/CurvTabDental.API/CurvTabDental.API.csproj

# Copy the rest of the backend source and publish
COPY backend/ backend/
RUN dotnet publish backend/CurvTabDental.API/CurvTabDental.API.csproj \
    -c Release -o /app/publish /p:UseAppHost=false

# ---------- Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Development
EXPOSE 8080
ENTRYPOINT ["dotnet", "CurvTabDental.API.dll"]